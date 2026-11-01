import type { IncomingMessage, ServerResponse } from "node:http";
import type { PlaidApi, Transaction } from "plaid";
import { createServiceSupabaseClient } from "../auth/supabase.js";
import { requireSession } from "../auth/session.js";
import { config } from "../config.js";
import { HttpError, isRecord, supabaseFailure } from "../errors.js";
import { sendJson } from "../http/response.js";
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

/**
 * Saves categorized transactions so other pages can query them. Best effort:
 * the live Plaid data is still returned if storage is unavailable.
 */
async function storeTransactions(
  admin: ReturnType<typeof createServiceSupabaseClient>,
  userId: string,
  range: { start: string; end: string },
  transactions: StoredTransaction[],
): Promise<void> {
  try {
    const sources = await admin
      .from("Income Source")
      .select("source_id,plaid_account_id")
      .eq("user_id", userId)
      .not("plaid_account_id", "is", null)
      .returns<{ source_id: string; plaid_account_id: string }[]>();
    if (sources.error) throw sources.error;
    const sourceIds = new Map((sources.data ?? []).map((row) => [row.plaid_account_id, row.source_id]));

    if (transactions.length) {
      const saved = await admin.from("Transaction").upsert(
        transactions.map((transaction) => ({
          user_id: userId,
          plaid_transaction_id: transaction.id,
          name: transaction.name,
          amount: transaction.amount,
          date: `${transaction.date}T00:00:00Z`,
          category_key: transaction.category,
          account_name: transaction.account,
          institution_name: transaction.institution,
          source_id: sourceIds.get(transaction.accountId) ?? null,
        })),
        { onConflict: "user_id,plaid_transaction_id" },
      );
      if (saved.error) throw saved.error;
    }

    // Drop stored rows in this range that Plaid no longer reports
    // (e.g. pending items that posted under a new ID).
    const current = new Set(transactions.map((transaction) => transaction.id));
    const stored = await admin
      .from("Transaction")
      .select("transaction_id,plaid_transaction_id")
      .eq("user_id", userId)
      .gte("date", `${range.start}T00:00:00Z`)
      .lte("date", `${range.end}T23:59:59Z`)
      .not("plaid_transaction_id", "is", null)
      .returns<{ transaction_id: string; plaid_transaction_id: string | null }[]>();
    if (stored.error) throw stored.error;
    const stale = (stored.data ?? [])
      .filter((row) => row.plaid_transaction_id && !current.has(row.plaid_transaction_id))
      .map((row) => row.transaction_id);
    if (stale.length) {
      const removed = await admin.from("Transaction").delete().in("transaction_id", stale);
      if (removed.error) throw removed.error;
    }
  } catch (error) {
    console.error("Unable to store imported transactions.", error instanceof Error ? error.message : error);
  }
}

async function readTransactions(userId: string, query: TransactionsQuery, today: string) {
  if (!config.supabaseSecretKey) {
    throw new HttpError(503, "Transaction storage is not configured. Set SUPABASE_SECRET_KEY on the server.");
  }
  const admin = createServiceSupabaseClient();
  // Custom categories, merchant rules and manual picks. If the tables are not set up yet,
  // fall back to the built-in categories instead of failing the whole page.
  let overrides: CategoryOverrides | undefined;
  let customCategories: CustomCategory[] = [];
  try {
    ({ overrides, customCategories } = await loadOverrides(admin, userId));
  } catch (error) {
    console.error("Unable to load custom categories.", error instanceof Error ? error.message : error);
  }
  const customKeys = customCategories.map((category) => category.key);
  const itemResult = await admin
    .from("Plaid Item")
    .select("item_id,institution_name,access_token_encrypted,created_at")
    .eq("user_id", userId)
    .returns<PlaidItemRow[]>();
  if (itemResult.error) throw supabaseFailure(itemResult.error);
  const items = itemResult.data ?? [];

  const months = monthRange(query.month, query.history + 1);
  // Transactions the user typed in themselves, for the same months.
  const manual: PublicTransaction[] = await listManualTransactions(
    admin,
    userId,
    `${months[0]}-01`,
    monthEnd(query.month),
    overrides?.validKeys,
  );
  // "connected" means the pages show real data (a bank, or the user's own entries) instead of the sample.
  const connected = items.length > 0 || manual.length > 0 || (await hasManualTransactions(admin, userId));

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
  const range = { start: `${months[0]}-01`, end: newest.end };

  const plaid = createPlaidClient();
  const fetchedTransactions: StoredTransaction[] = [];
  let warning: string | undefined;
  for (const item of items) {
    try {
      const accessToken = decryptPlaidAccessToken(item.access_token_encrypted);
      const fetched = await fetchItemTransactions(plaid, accessToken, range.start, range.end);
      fetchedTransactions.push(
        ...toStoredTransactions(fetched.transactions, fetched.accounts, item.institution_name, overrides),
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
  if (!warning) await storeTransactions(admin, userId, range, fetchedTransactions);

  const importNote = items.some((item) => isStillImporting(item.created_at, Date.now()))
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
    sendJson(response, 200, await readTransactions(user.id, query, today));
    return true;
  }
  return false;
}
