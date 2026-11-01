import type { IncomingMessage, ServerResponse } from "node:http";
import type { PlaidApi, Transaction } from "plaid";
import { createServiceSupabaseClient } from "../auth/supabase.js";
import { requireSession } from "../auth/session.js";
import { config } from "../config.js";
import { HttpError, isRecord, supabaseFailure } from "../errors.js";
import { sendJson } from "../http/response.js";
import { createTimer, type Timer } from "../http/timing.js";
import {
  createPlaidClient,
  decryptPlaidAccessToken,
  logPlaidFailure,
} from "../plaid/client.js";
import {
  applyOverrides,
  categorizeTransaction,
  categoryIds,
  type CategoryId,
  type CategoryOverrides,
} from "../categorize.js";
import { loadOverrides, type CustomCategory } from "./categories.js";
import { readCache, writeCache } from "../plaid/cache.js";
import { enqueueStore } from "./store-queue.js";
import { hasManualTransactions, listManualTransactions } from "./manual-transactions.js";
import {
  addMonths,
  compareMonths,
  dateRangeForMonth,
  isMonthKey,
  monthKeyOfDate,
  monthRange,
  transactionHistoryMonths,
  monthEnd,
  utcDateString,
  type MonthKey,
} from "../../shared/months.js";

const pageSize = 500;
const maxMonthsBack = transactionHistoryMonths;
const maxHistoryMonths = 12;

interface PlaidItemRow {
  item_id: string;
  institution_name: string;
  access_token_encrypted: string;
  created_at: string;
}

// Plaid pulls the last ~30 days first and fills in older months a little later.
const importWindowMs = 10 * 60 * 1000;

export function isStillImporting(createdAt: string, now: number): boolean {
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && now - created < importWindowMs;
}

export interface PublicTransaction {
  id: string;
  name: string;
  amount: number;
  date: string;
  category: CategoryId;
  account: string;
  institution: string;
  /** typed in by the user rather than imported from a bank */
  manual?: boolean;
}

export interface StoredTransaction extends PublicTransaction {
  accountId: string;
}

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

function plaidErrorCode(error: unknown): string | undefined {
  const response = isRecord(error) && isRecord(error.response) ? error.response : null;
  const data = response && isRecord(response.data) ? response.data : null;
  return data && typeof data.error_code === "string" ? data.error_code : undefined;
}

async function fetchItemTransactions(
  plaid: PlaidApi,
  accessToken: string,
  startDate: string,
  endDate: string,
) {
  const transactions: Transaction[] = [];
  let accounts: { account_id: string; name: string }[] = [];
  let total = 0;
  do {
    const result = await plaid.transactionsGet({
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: {
        count: pageSize,
        offset: transactions.length,
        include_personal_finance_category: true,
      },
    });
    accounts = result.data.accounts;
    total = result.data.total_transactions;
    transactions.push(...result.data.transactions);
    if (!result.data.transactions.length) break;
  } while (transactions.length < total);
  return { transactions, accounts };
}

export function toStoredTransactions(
  plaidTransactions: Transaction[],
  accounts: { account_id: string; name: string }[],
  institution: string,
  overrides?: CategoryOverrides,
): StoredTransaction[] {
  const accountNames = new Map(accounts.map((account) => [account.account_id, account.name]));
  const result: StoredTransaction[] = [];
  for (const transaction of plaidTransactions) {
    const category = categorizeTransaction({
      name: transaction.name,
      merchantName: transaction.merchant_name,
      amount: transaction.amount,
      primaryCategory: transaction.personal_finance_category?.primary,
      detailedCategory: transaction.personal_finance_category?.detailed,
    });
    if (!category) continue;
    const name = transaction.merchant_name || transaction.name;
    result.push({
      id: transaction.transaction_id,
      name,
      amount: transaction.amount,
      date: transaction.date,
      category: applyOverrides(category, { id: transaction.transaction_id, name }, overrides),
      account: accountNames.get(transaction.account_id) ?? "Linked account",
      institution,
      accountId: transaction.account_id,
    });
  }
  return result;
}

export interface StoreRow {
  user_id: string;
  plaid_transaction_id: string;
  name: string;
  amount: number;
  date: string;
  category_key: string;
  account_name: string;
  institution_name: string;
  source_id: string | null;
}

interface ExistingRow {
  transaction_id: string;
  plaid_transaction_id: string;
  name: string | null;
  amount: number | null;
  date: string | null;
  category_key: string | null;
  account_name: string | null;
  institution_name: string | null;
  source_id: string | null;
}

/** Compares what is saved with what Plaid just returned, so only real changes are written. */
export function planStoreChanges(
  existing: ExistingRow[],
  desired: StoreRow[],
): { upserts: StoreRow[]; staleIds: string[] } {
  const saved = new Map(existing.map((row) => [row.plaid_transaction_id, row]));
  const upserts = desired.filter((row) => {
    const old = saved.get(row.plaid_transaction_id);
    return (
      !old ||
      old.name !== row.name ||
      old.amount !== row.amount ||
      (old.date ?? "").slice(0, 10) !== row.date.slice(0, 10) ||
      old.category_key !== row.category_key ||
      old.account_name !== row.account_name ||
      old.institution_name !== row.institution_name ||
      old.source_id !== row.source_id
    );
  });
  const current = new Set(desired.map((row) => row.plaid_transaction_id));
  // Rows Plaid no longer reports (e.g. pending items that posted under a new ID).
  const staleIds = existing.filter((row) => !current.has(row.plaid_transaction_id)).map((row) => row.transaction_id);
  return { upserts, staleIds };
}

const readPageSize = 1000;

/**
 * Saves categorized transactions so other pages can query them. Runs after the response is sent
 * and writes only what changed. Best effort: the live data was already returned.
 */
async function storeTransactions(
  admin: ReturnType<typeof createServiceSupabaseClient>,
  userId: string,
  range: { start: string; end: string },
  transactions: StoredTransaction[],
): Promise<void> {
  try {
    const loadSources = async () => {
      const result = await admin
        .from("Income Source")
        .select("source_id,plaid_account_id")
        .eq("user_id", userId)
        .not("plaid_account_id", "is", null)
        .returns<{ source_id: string; plaid_account_id: string }[]>();
      if (result.error) throw result.error;
      return new Map((result.data ?? []).map((row) => [row.plaid_account_id, row.source_id]));
    };
    const loadExisting = async () => {
      const rows: ExistingRow[] = [];
      for (let from = 0; ; from += readPageSize) {
        const page = await admin
          .from("Transaction")
          .select("transaction_id,plaid_transaction_id,name,amount,date,category_key,account_name,institution_name,source_id")
          .eq("user_id", userId)
          .not("plaid_transaction_id", "is", null)
          .gte("date", `${range.start}T00:00:00Z`)
          .lte("date", `${range.end}T23:59:59Z`)
          .order("transaction_id")
          .range(from, from + readPageSize - 1)
          .returns<ExistingRow[]>();
        if (page.error) throw page.error;
        rows.push(...(page.data ?? []));
        if ((page.data ?? []).length < readPageSize) break;
      }
      return rows;
    };
    const [sourceIds, existing] = await Promise.all([loadSources(), loadExisting()]);

    const desired: StoreRow[] = transactions.map((transaction) => ({
      user_id: userId,
      plaid_transaction_id: transaction.id,
      name: transaction.name,
      amount: transaction.amount,
      date: `${transaction.date}T00:00:00Z`,
      category_key: transaction.category,
      account_name: transaction.account,
      institution_name: transaction.institution,
      source_id: sourceIds.get(transaction.accountId) ?? null,
    }));
    const { upserts, staleIds } = planStoreChanges(existing, desired);

    const writes: PromiseLike<unknown>[] = [];
    for (let start = 0; start < upserts.length; start += 500) {
      writes.push(
        admin
          .from("Transaction")
          .upsert(upserts.slice(start, start + 500), { onConflict: "user_id,plaid_transaction_id" })
          .then((result) => {
            if (result.error) throw result.error;
          }),
      );
    }
    for (let start = 0; start < staleIds.length; start += 100) {
      writes.push(
        admin
          .from("Transaction")
          .delete()
          .in("transaction_id", staleIds.slice(start, start + 100))
          .then((result) => {
            if (result.error) throw result.error;
          }),
      );
    }
    await Promise.all(writes);
  } catch (error) {
    console.error("Unable to store imported transactions.", error instanceof Error ? error.message : error);
  }
}

async function readTransactions(
  userId: string,
  query: TransactionsQuery,
  today: string,
  timer: Timer,
  refresh: boolean,
) {
  if (!config.supabaseSecretKey) {
    throw new HttpError(503, "Transaction storage is not configured. Set SUPABASE_SECRET_KEY on the server.");
  }
  const admin = createServiceSupabaseClient();
  const months = monthRange(query.month, query.history + 1);

  // These lookups do not depend on each other, so they run together: every database call is a network
  // round trip, and waiting for them one after another was a large part of the load time.
  const [loaded, itemResult, manualRows, hasManualRow] = await Promise.all([
    // Custom categories, merchant rules and manual picks. If the tables are not set up yet,
    // fall back to the built-in categories instead of failing the whole page.
    timer.measure("overrides", () =>
      loadOverrides(admin, userId).catch((error: unknown) => {
        console.error("Unable to load custom categories.", error instanceof Error ? error.message : error);
        return undefined;
      }),
    ),
    timer.measure("items", async () =>
      admin
        .from("Plaid Item")
        .select("item_id,institution_name,access_token_encrypted,created_at")
        .eq("user_id", userId)
        .returns<PlaidItemRow[]>(),
    ),
    // Transactions the user typed in themselves, for the same months.
    timer.measure("manual", () => listManualTransactions(admin, userId, `${months[0]}-01`, monthEnd(query.month))),
    timer.measure("hasManual", () => hasManualTransactions(admin, userId)),
  ]);
  if (itemResult.error) throw supabaseFailure(itemResult.error);
  const items = itemResult.data ?? [];
  const overrides: CategoryOverrides | undefined = loaded?.overrides;
  const customCategories: CustomCategory[] = loaded?.customCategories ?? [];
  const customKeys = customCategories.map((category) => category.key);
  const manual: PublicTransaction[] = overrides
    ? manualRows.map((entry) => (overrides.validKeys.has(entry.category) ? entry : { ...entry, category: "other" }))
    : manualRows;
  // "connected" means the pages show real data (a bank, or the user's own entries) instead of the sample.
  const connected = items.length > 0 || manual.length > 0 || hasManualRow;

  const finish = (all: PublicTransaction[], warning?: string) => ({
    month: query.month,
    customCategories,
    ...(query.history ? { history: summarizeMonths(all, months, customKeys) } : {}),
    connected,
    transactions: all
      .filter((transaction) => monthKeyOfDate(transaction.date) === query.month)
      .sort((first, second) => second.date.localeCompare(first.date)),
    ...(warning ? { warning } : {}),
  });

  if (!items.length) return finish(manual);
  if (!config.plaidTokenEncryptionKey) {
    throw new HttpError(503, "Plaid token encryption is not configured on the server.");
  }

  // The newest month stops at today. A month that has not started in server time has no bank data yet.
  const newest = dateRangeForMonth(query.month, today);
  if (!newest) return finish(manual);
  // Pull the last six months (or further back if asked) in one go and remember them for a few minutes,
  // so switching months or moving between pages does not go back to Plaid.
  const pullStart = [`${months[0]}-01`, `${addMonths(monthKeyOfDate(today), -5)}-01`].sort()[0] as string;
  const pullEnd = today;
  // Plaid fills in older months a few minutes after linking, so do not remember a partial answer.
  const stillImporting = items.some((item) => isStillImporting(item.created_at, Date.now()));

  let plaid: PlaidApi | undefined;
  const fetchedTransactions: StoredTransaction[] = [];
  let warning: string | undefined;
  let pulledFresh = false;
  for (const item of items) {
    try {
      let pull = refresh ? undefined : readCache(item.item_id, pullStart, pullEnd);
      if (!pull) {
        const accessToken = decryptPlaidAccessToken(item.access_token_encrypted);
        plaid ??= createPlaidClient();
        const client = plaid;
        const fetched = await timer.measure("plaid", () => fetchItemTransactions(client, accessToken, pullStart, pullEnd));
        pull = { start: pullStart, end: pullEnd, fetchedAt: Date.now(), transactions: fetched.transactions, accounts: fetched.accounts };
        if (!stillImporting) writeCache(item.item_id, pull);
        pulledFresh = true;
      }
      fetchedTransactions.push(
        ...toStoredTransactions(pull.transactions, pull.accounts, item.institution_name, overrides),
      );
    } catch (error) {
      logPlaidFailure(error, "transactions/get");
      warning =
        plaidErrorCode(error) === "PRODUCT_NOT_READY"
          ? "Your bank is still importing transactions. Check back in a minute."
          : "Some bank connections could not be refreshed for transactions.";
    }
  }

  fetchedTransactions.sort((first, second) => second.date.localeCompare(first.date));
  // Save in the background (only when Plaid was actually asked) so the page does not wait for the database.
  if (!warning && pulledFresh) {
    enqueueStore(userId, () => storeTransactions(admin, userId, { start: pullStart, end: pullEnd }, fetchedTransactions));
  }

  const importNote = stillImporting
    ? "Your bank is still importing older transactions, so earlier months may be incomplete for a few minutes."
    : undefined;
  const visible: PublicTransaction[] = fetchedTransactions.map(
    ({ accountId: _accountId, ...transaction }) => transaction,
  );
  return finish([...visible, ...manual], warning ?? importNote);
}

export async function handleTransactionsApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === "/api/transactions" && request.method === "GET") {
    const { user } = await requireSession(request, response);
    const url = new URL(request.url ?? pathname, "http://localhost");
    const today = utcDateString();
    const query = parseTransactionsQuery(url.searchParams, today);
    const timer = createTimer();
    // refresh=1 skips the short-lived copy of the bank data and asks Plaid again.
    const refresh = url.searchParams.get("refresh") === "1";
    const body = await timer.measure("total", () => readTransactions(user.id, query, today, timer, refresh));
    sendJson(response, 200, body, { "Server-Timing": timer.header() });
    return true;
  }
  return false;
}
