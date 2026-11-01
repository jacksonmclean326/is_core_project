// End-to-end check against the running server (npm start), the real Plaid sandbox and Supabase.
// Creates a throwaway user, links Plaid's dynamic-transactions sandbox bank, verifies the month logic,
// then deletes everything it created.
//   node --env-file=.env --import tsx tests/e2e.integration.mts
import assert from "node:assert/strict";
import { categorizeTransaction, categoryIds } from "../src/server/categorize.ts";
import { addMonths, monthEnd, monthKeyOfDate, monthRange, utcDateString } from "../src/shared/months.ts";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const supabaseUrl = process.env.SUPABASE_URL!;
const adminHeaders = { apikey: process.env.SUPABASE_SECRET_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` };
const email = `e2e.${Date.now()}@example.com`;
const password = "E2e!Pass-2026-xyz";
let cookie = "";
let userId = "";
let checks = 0;
const ok = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
  });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((value) => value.split(";")[0]).join("; ");
  return { status: response.status, body: (await response.json().catch(() => null)) as any };
}
const rest = (path: string, init: RequestInit = {}) => fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...adminHeaders, "Content-Type": "application/json", Prefer: "count=exact", ...init.headers } });
const countRows = async (path: string) => Number((await rest(path, { method: "HEAD" })).headers.get("content-range")?.split("/")[1]);

try {
  // ---- sign up + link a sandbox bank ---------------------------------------------------------
  const signup = await api("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password, firstName: "E2E", lastName: "Test", fullName: "E2E Test" }) });
  ok(signup.status === 200, `signup ${signup.status}`);
  userId = signup.body.user.id;
  const publicToken = (await (await fetch("https://sandbox.plaid.com/sandbox/public_token/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.CLIENT_ID, secret: process.env.PLAID_SECRET, institution_id: "ins_109508",
      initial_products: ["transactions"], options: { override_username: "user_transactions_dynamic" },
    }),
  })).json()).public_token;
  const exchange = await api("/api/plaid/exchange", { method: "POST", body: JSON.stringify({ publicToken, institutionId: "ins_109508", institutionName: "First Platypus Bank" }) });
  ok(exchange.status === 200, `exchange ${exchange.status}`);

  // ---- independent ground truth straight from Plaid ----------------------------------------------
  const today = utcDateString();
  const thisMonth = monthKeyOfDate(today);
  const anyMonth = (await api(`/api/transactions?month=${thisMonth}`)).body; // warms the item up
  void anyMonth;
  const accessRows = await (await rest(`Plaid%20Item?select=access_token_encrypted&user_id=eq.${userId}`)).json();
  const { decryptPlaidAccessToken, createPlaidClient } = await import("../src/server/plaid/client.ts");
  const plaid = createPlaidClient();
  const token = decryptPlaidAccessToken(accessRows[0].access_token_encrypted);
  // Plaid fills in older months after the first ~30 days: wait for the historical pull to finish.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const status = (await plaid.transactionsSync({ access_token: token, count: 1 })).data.transactions_update_status;
      if (status === "HISTORICAL_UPDATE_COMPLETE") break;
    } catch {
      /* not ready yet */
    }
    ok(attempt < 40, "Plaid historical import finished within 3 minutes");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  const truth: { date: string; amount: number; category: string; id: string }[] = [];
  const oldestMonth = addMonths(thisMonth, -5);
  for (let offset = 0; ; ) {
    const result = await plaid.transactionsGet({ access_token: token, start_date: `${oldestMonth}-01`, end_date: today, options: { count: 500, offset, include_personal_finance_category: true } });
    for (const t of result.data.transactions) {
      const category = categorizeTransaction({ name: t.name, merchantName: t.merchant_name, amount: t.amount, primaryCategory: t.personal_finance_category?.primary, detailedCategory: t.personal_finance_category?.detailed });
      if (category) truth.push({ date: t.date, amount: t.amount, category, id: t.transaction_id });
    }
    offset += result.data.transactions.length;
    if (!result.data.transactions.length || offset >= result.data.total_transactions) break;
  }
  ok(truth.length > 0, "sandbox returned spending");
  const truthMonths = new Set(truth.map((t) => monthKeyOfDate(t.date)));
  console.log("sandbox data covers months:", [...truthMonths].sort().join(", "));
  ok(truthMonths.size >= 2, "sandbox history spans at least two calendar months (needed to test month logic)");

  // ---- history=5 summaries match ground truth, month by month ----------------------------------------
  const history = await api(`/api/transactions?month=${thisMonth}&history=5`);
  ok(history.status === 200, `history status ${history.status}`);
  ok(history.body.connected === true, "connected");
  ok(history.body.warning === undefined || /still importing/.test(history.body.warning), `only the importing note may appear: ${history.body.warning}`);
  const expectedMonths = monthRange(thisMonth, 6);
  ok(JSON.stringify(history.body.history.map((h: any) => h.month)) === JSON.stringify(expectedMonths), "history lists the 6 consecutive months, oldest first");
  for (const month of expectedMonths) {
    const entry = history.body.history.find((h: any) => h.month === month);
    const mine = truth.filter((t) => monthKeyOfDate(t.date) === month);
    const expectedTotal = Math.round(mine.reduce((sum, t) => sum + Math.round(t.amount * 100), 0)) / 100;
    ok(entry.total === expectedTotal, `${month} total ${entry.total} == ${expectedTotal}`);
    for (const id of categoryIds) {
      const cents = mine.filter((t) => t.category === id).reduce((sum, t) => sum + Math.round(t.amount * 100), 0);
      ok(entry.byCategory[id] === cents / 100, `${month} ${id}`);
    }
  }
  const monthSum = history.body.history.reduce((sum: number, h: any) => sum + Math.round(h.total * 100), 0);
  const truthSum = truth.reduce((sum, t) => sum + Math.round(t.amount * 100), 0);
  ok(monthSum === truthSum, "the six monthly totals add up to the whole range");

  // ---- each individual month returns only its own transactions -------------------------------------------
  for (const month of expectedMonths) {
    const response = await api(`/api/transactions?month=${month}`);
    ok(response.status === 200, `${month} status`);
    ok(response.body.month === month, `${month} echoed`);
    const dates: string[] = response.body.transactions.map((t: any) => t.date);
    ok(dates.every((d) => monthKeyOfDate(d) === month), `${month}: every transaction date is inside the month`);
    ok(dates.every((d) => d >= `${month}-01` && d <= monthEnd(month)), `${month}: dates within first..last day`);
    ok(dates.every((d, i) => i === 0 || dates[i - 1]! >= d), `${month}: newest first`);
    const expectedIds = truth.filter((t) => monthKeyOfDate(t.date) === month).map((t) => t.id).sort();
    const gotIds = response.body.transactions.map((t: any) => t.id).sort();
    ok(JSON.stringify(gotIds) === JSON.stringify(expectedIds), `${month}: same transaction set as Plaid (endpoint ${gotIds.length}, ground truth ${expectedIds.length}, endpoint dates ${[...new Set(response.body.transactions.map((t: any) => t.date))].slice(0, 5)})`);
    ok(response.body.history === undefined, `${month}: no history unless asked`);
  }
  const current = (await api(`/api/transactions?month=${thisMonth}`)).body;
  ok(current.transactions.every((t: any) => t.date <= today), "current month never includes future dates");

  // ---- validation -----------------------------------------------------------------------------------------------------
  for (const query of ["month=2026-13", "month=abc", "month=2026-1", `month=${addMonths(thisMonth, 2)}`, `month=${addMonths(thisMonth, -25)}`, `month=${thisMonth}&history=13`, `month=${thisMonth}&history=-1`, `month=${thisMonth}&history=x`, `month=${addMonths(thisMonth, -24)}&history=1`]) {
    const response = await api(`/api/transactions?${query}`);
    ok(response.status === 400, `${query} -> 400 (got ${response.status})`);
    ok(typeof response.body.error === "string", `${query} has an error message`);
  }
  const next = await api(`/api/transactions?month=${addMonths(thisMonth, 1)}`);
  ok(next.status === 200 && next.body.transactions.length === 0, "next month (clock-skew slack) is allowed and empty");
  const oldest = await api(`/api/transactions?month=${addMonths(thisMonth, -24)}`);
  ok(oldest.status === 200, "exactly 24 months back is allowed");
  cookie = "";
  ok((await api(`/api/transactions?month=${thisMonth}`)).status === 401, "signed-out requests are rejected");
  await api("/api/auth/signin", { method: "POST", body: JSON.stringify({ email, password }) });

  // ---- stored rows ----------------------------------------------------------------------------------------------------------
  const stored = await countRows(`Transaction?select=transaction_id&user_id=eq.${userId}`);
  ok(stored === truth.length, `stored ${stored} rows == ${truth.length} categorized transactions in range`);
  const bad = await countRows(`Transaction?select=transaction_id&user_id=eq.${userId}&category_key=is.null`);
  ok(bad === 0, "every stored row has a category");
  await api(`/api/transactions?month=${thisMonth}&history=5`);
  ok((await countRows(`Transaction?select=transaction_id&user_id=eq.${userId}`)) === stored, "re-fetching does not duplicate rows");
  await api(`/api/transactions?month=${addMonths(thisMonth, -1)}`);
  ok((await countRows(`Transaction?select=transaction_id&user_id=eq.${userId}`)) === stored, "fetching a single month leaves other months' rows alone");
  for (const month of expectedMonths) {
    const inMonth = await countRows(`Transaction?select=transaction_id&user_id=eq.${userId}&date=gte.${month}-01T00:00:00Z&date=lte.${monthEnd(month)}T23:59:59Z`);
    ok(inMonth === truth.filter((t) => monthKeyOfDate(t.date) === month).length, `${month}: stored row count by date range matches`);
  }
  console.log(`\nALL PASSED: ${checks} checks`);
} finally {
  // ---- cleanup (only rows belonging to the throwaway user) -----------------------------------------------------------------
  if (userId) {
    const items = (await api("/api/plaid/accounts").catch(() => null))?.body?.connections ?? [];
    for (const item of items) await api(`/api/plaid/items/${item.id}`, { method: "DELETE" });
    await rest(`Transaction?user_id=eq.${userId}`, { method: "DELETE" });
    await rest(`User?user_id=eq.${userId}`, { method: "DELETE" });
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: adminHeaders });
    const left = (await Promise.all(["Transaction", "Income%20Source", "Plaid%20Item", "User"].map((t) => countRows(`${t}?select=*&user_id=eq.${userId}`)))).reduce((a, b) => a + b, 0);
    console.log(left === 0 ? "cleanup: test user and all its rows removed" : `cleanup INCOMPLETE: ${left} rows remain for ${userId}`);
  }
}
