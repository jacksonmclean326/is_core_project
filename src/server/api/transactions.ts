import type { IncomingMessage, ServerResponse } from "node:http";
import { createServiceSupabaseClient } from "../auth/supabase.js";
import { requireSession } from "../auth/session.js";
import { config } from "../config.js";
import { HttpError, supabaseFailure } from "../errors.js";
import { sendJson } from "../http/response.js";
import { createTimer, type Timer } from "../http/timing.js";
import { categoryIds, type CategoryId } from "../categorize.js";
import { listCustomCategories, type CustomCategory } from "../category-store.js";
import { isSyncing, lastSyncFailed, needsSync, startSync, syncColumns, type SyncItem } from "../plaid/sync.js";
import type { PublicTransaction } from "../plaid/convert.js";
import {
  addMonths,
  compareMonths,
  isMonthKey,
  monthEnd,
  monthKeyOfDate,
  monthRange,
  transactionHistoryMonths,
  utcDateString,
  type MonthKey,
} from "../../shared/months.js";

export { toStoredTransactions } from "../plaid/convert.js";
export type { PublicTransaction, StoredTransaction } from "../plaid/convert.js";

const maxMonthsBack = transactionHistoryMonths;
const maxHistoryMonths = 12;
const readPageSize = 1000;
/** On the very first load, wait this long for the bank's first import so the page can show data right away. */
const firstLoadWaitMs = 2500;
/** A forced refresh waits for the sync to finish, up to this long. */
const refreshWaitMs = 25_000;

export interface MonthSummary {
  month: MonthKey;
  total: number;
  byCategory: Record<CategoryId, number>;
}

export interface TransactionsQuery {
  month: MonthKey;
  history: number;
}

/**
 * Reads `month=YYYY-MM` (default: the current month) and `history=N` (how many
 * earlier months to summarize as well, 0-12) from the request URL.
 */
export function parseTransactionsQuery(params: URLSearchParams, today: string): TransactionsQuery {
  const thisMonth = monthKeyOfDate(today);
  const oldestAllowed = addMonths(thisMonth, -maxMonthsBack);
  const month = params.get("month") ?? thisMonth;
  if (!isMonthKey(month)) throw new HttpError(400, "month must look like 2026-10.");
  // One month of slack so a user whose local date is already tomorrow is not rejected.
  if (compareMonths(month, addMonths(thisMonth, 1)) > 0) {
    throw new HttpError(400, "That month has not started yet.");
  }

  const requestedHistory = params.get("history");
  const history = requestedHistory === null ? 0 : Number(requestedHistory);
  if (requestedHistory === "" || !Number.isInteger(history) || history < 0 || history > maxHistoryMonths) {
    throw new HttpError(400, `history must be a whole number from 0 to ${maxHistoryMonths}.`);
  }
  if (compareMonths(addMonths(month, -history), oldestAllowed) < 0) {
    throw new HttpError(400, `Transactions are only available for the last ${maxMonthsBack} months.`);
  }
  return { month, history };
}

/** Per-month totals, summed in whole cents so floating-point sums cannot drift. */
export function summarizeMonths(
  transactions: PublicTransaction[],
  months: MonthKey[],
  customKeys: string[] = [],
): MonthSummary[] {
  const keys = [...new Set<CategoryId>([...categoryIds, ...customKeys, ...transactions.map((t) => t.category)])];
  const cents = new Map<MonthKey, Record<CategoryId, number>>(
    months.map((month) => [month, Object.fromEntries(keys.map((id) => [id, 0])) as Record<CategoryId, number>]),
  );
  for (const transaction of transactions) {
    const bucket = cents.get(monthKeyOfDate(transaction.date));
    if (bucket) bucket[transaction.category] = (bucket[transaction.category] ?? 0) + Math.round(transaction.amount * 100);
  }
  return months.map((month) => {
    const bucket = cents.get(month);
    const byCategory = Object.fromEntries(keys.map((id) => [id, (bucket?.[id] ?? 0) / 100])) as Record<CategoryId, number>;
    const totalCents = keys.reduce((sum, id) => sum + (bucket?.[id] ?? 0), 0);
    return { month, total: totalCents / 100, byCategory };
  });
}

type Admin = ReturnType<typeof createServiceSupabaseClient>;

interface RowRecord {
  transaction_id: string;
  plaid_transaction_id: string | null;
  name: string | null;
  amount: number | null;
  date: string | null;
  category_key: string | null;
  account_name: string | null;
  institution_name: string | null;
}

/** Turns a saved row (bank or manual) into what the pages receive. */
export function toPublicRow(row: RowRecord, validKeys?: Set<string>): PublicTransaction {
  const manual = row.plaid_transaction_id === null;
  const category = row.category_key && (!validKeys || validKeys.has(row.category_key)) ? row.category_key : "other";
  return {
    id: row.plaid_transaction_id ?? row.transaction_id,
    name: row.name ?? (manual ? "Manual entry" : "Transaction"),
    amount: row.amount ?? 0,
    date: (row.date ?? "").slice(0, 10),
    category,
    account: row.account_name ?? (manual ? "Manual entry" : "Linked account"),
    institution: row.institution_name ?? (manual ? "Manual" : ""),
    ...(manual ? { manual: true as const } : {}),
  };
}

async function loadRows(admin: Admin, userId: string, start: string, end: string): Promise<RowRecord[]> {
  const rows: RowRecord[] = [];
  for (let from = 0; ; from += readPageSize) {
    const page = await admin
      .from("Transaction")
      .select("transaction_id,plaid_transaction_id,name,amount,date,category_key,account_name,institution_name")
      .eq("user_id", userId)
      .gte("date", `${start}T00:00:00Z`)
      .lte("date", `${end}T23:59:59Z`)
      .order("date", { ascending: false })
      .order("transaction_id")
      .range(from, from + readPageSize - 1)
      .returns<RowRecord[]>();
    if (page.error) throw supabaseFailure(page.error);
    rows.push(...(page.data ?? []));
    if ((page.data ?? []).length < readPageSize) break;
  }
  return rows;
}

async function hasAnyTransaction(admin: Admin, userId: string): Promise<boolean> {
  const result = await admin
    .from("Transaction")
    .select("transaction_id")
    .eq("user_id", userId)
    .limit(1)
    .returns<{ transaction_id: string }[]>();
  if (result.error) throw supabaseFailure(result.error);
  return (result.data ?? []).length > 0;
}

async function loadItems(admin: Admin, userId: string): Promise<SyncItem[]> {
  const result = await admin.from("Plaid Item").select(syncColumns).eq("user_id", userId).returns<SyncItem[]>();
  if (result.error) throw supabaseFailure(result.error);
  return result.data ?? [];
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function readTransactions(userId: string, query: TransactionsQuery, refresh: boolean, timer: Timer) {
  if (!config.supabaseSecretKey) {
    throw new HttpError(503, "Transaction storage is not configured. Set SUPABASE_SECRET_KEY on the server.");
  }
  const admin = createServiceSupabaseClient();
  const months = monthRange(query.month, query.history + 1);
  const start = `${months[0]}-01`;
  const end = monthEnd(query.month);

  // Everything comes from our own database, in one round trip. Asking Plaid happens in the background.
  const readAll = () =>
    Promise.all([
      timer.measure("categories", () => listCustomCategories(admin, userId)),
      timer.measure("items", () => loadItems(admin, userId)),
      timer.measure("rows", () => loadRows(admin, userId, start, end)),
      timer.measure("any", () => hasAnyTransaction(admin, userId)),
    ]);
  let [customCategories, items, rows, anyRow] = await readAll();

  // Start a background sync for any bank whose saved data is out of date. The page does not wait for it,
  // except on the very first load (nothing saved yet) or when a refresh is requested.
  const now = Date.now();
  const due = items.filter((item) => refresh || needsSync(item, now));
  const syncs = due.map((item) => startSync(item, { force: refresh }));
  if (syncs.length && (refresh || !anyRow)) {
    await timer.measure("sync", () =>
      Promise.race([Promise.all(syncs), delay(refresh ? refreshWaitMs : firstLoadWaitMs)]),
    );
    [customCategories, items, rows, anyRow] = await readAll();
  }

  const validKeys = new Set<string>([...categoryIds, ...customCategories.map((category: CustomCategory) => category.key)]);
  const all = rows.map((row) => toPublicRow(row, validKeys));
  const customKeys = customCategories.map((category) => category.key);

  const checkedAt = Date.now();
  const syncing = items.some(
    (item) => isSyncing(item.item_id) || (!lastSyncFailed(item.item_id) && (needsSync(item, checkedAt) || !item.history_complete)),
  );
  const importing = items.some((item) => !item.history_complete && !lastSyncFailed(item.item_id));
  const failed = items.some((item) => lastSyncFailed(item.item_id));
  const warning = failed
    ? "Some bank connections could not be refreshed. Showing what was saved earlier."
    : importing
      ? "Your bank is still importing older transactions, so earlier months may be incomplete for a few minutes."
      : undefined;

  return {
    month: query.month,
    customCategories,
    ...(query.history ? { history: summarizeMonths(all, months, customKeys) } : {}),
    // "connected" means the pages show real data (a bank, or the user's own entries) instead of the sample.
    connected: items.length > 0 || anyRow,
    syncing,
    transactions: all.filter((transaction) => monthKeyOfDate(transaction.date) === query.month),
    ...(warning ? { warning } : {}),
  };
}

export async function handleTransactionsApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === "/api/transactions" && request.method === "GET") {
    const { user } = await requireSession(request, response);
    const url = new URL(request.url ?? pathname, "http://localhost");
    const query = parseTransactionsQuery(url.searchParams, utcDateString());
    // refresh=1 syncs with the bank now and waits for it (used by tests and a manual "refresh").
    const refresh = url.searchParams.get("refresh") === "1";
    const timer = createTimer();
    const body = await timer.measure("total", () => readTransactions(user.id, query, refresh, timer));
    sendJson(response, 200, body, { "Server-Timing": timer.header() });
    return true;
  }
  return false;
}
