// Checks that loading transactions is fast and that what loads quickly is exactly what a sync with the
// bank produces. Read-only for the account's data: it signs in to an account that already has a bank linked.
//   $env:DEMO_EMAIL="..."; $env:DEMO_PASSWORD="..."
//   node --env-file=.env --import tsx tests/performance.integration.mts
import assert from "node:assert/strict";
import { addMonths, monthKeyOfDate, utcDateString } from "../src/shared/months.ts";

const email = process.env.DEMO_EMAIL;
const password = process.env.DEMO_PASSWORD;
if (!email || !password) {
  console.log("SKIPPED: set DEMO_EMAIL and DEMO_PASSWORD to an account with a bank linked.");
  process.exit(0);
}

const base = process.env.BASE_URL ?? "http://localhost:3000";
const supabaseUrl = process.env.SUPABASE_URL!;
const adminHeaders = { apikey: process.env.SUPABASE_SECRET_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` };
let cookie = "";
let checks = 0;
const ok = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};

async function call(path: string, init: RequestInit = {}) {
  const start = performance.now();
  const response = await fetch(base + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
  });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((value) => value.split(";")[0]).join("; ");
  const body = await response.json().catch(() => null);
  return { ms: performance.now() - start, status: response.status, body, timing: response.headers.get("server-timing") ?? "" };
}

const signin = await call("/api/auth/signin", { method: "POST", body: JSON.stringify({ email, password }) });
ok(signin.status === 200, "signed in");
const userId = signin.body.user.id as string;
const rowCount = async () =>
  Number((await fetch(`${supabaseUrl}/rest/v1/Transaction?select=transaction_id&user_id=eq.${userId}`, { method: "HEAD", headers: { ...adminHeaders, Prefer: "count=exact" } })).headers.get("content-range")?.split("/")[1]);

const thisMonth = monthKeyOfDate(utcDateString());
const queries = [
  `month=${thisMonth}`,
  `month=${addMonths(thisMonth, -1)}`,
  `month=${addMonths(thisMonth, -2)}`,
  `month=${thisMonth}&history=5`,
  `month=${addMonths(thisMonth, -1)}&history=3`,
];

// 1. sync with the bank now and keep the answers as the reference
const reference = new Map<string, any>();
const syncTimes: number[] = [];
for (const query of queries) {
  const result = await call(`/api/transactions?${query}&refresh=1`);
  ok(result.status === 200, `${query}: sync ok`);
  ok(result.body.syncing === false, `${query}: nothing left to sync after a refresh`);
  reference.set(query, result.body);
  syncTimes.push(result.ms);
}
const rowsAfterSync = await rowCount();
ok(rowsAfterSync > 0, `transactions are saved in the database (${rowsAfterSync} rows)`);

// 2. ordinary loads read the database and must return exactly the same data
const loadTimes: number[] = [];
for (let round = 0; round < 3; round += 1) {
  for (const query of queries) {
    const result = await call(`/api/transactions?${query}`);
    ok(result.status === 200, `${query}: ok`);
    assert.deepEqual(result.body, reference.get(query), `${query}: same data as after a sync`);
    checks += 1;
    ok(!/(^|, )sync;/.test(result.timing), `${query}: did not wait for the bank`);
    loadTimes.push(result.ms);
  }
}

// 3. syncing again changes nothing that is saved
const before = JSON.stringify(reference.get(queries[3]!));
await call(`/api/transactions?${queries[3]}&refresh=1`);
ok((await rowCount()) === rowsAfterSync, "a repeat sync leaves the saved rows exactly as they were");
ok(JSON.stringify((await call(`/api/transactions?${queries[3]}`)).body) === before, "and the answer does not change");

// 4. not signed in: no data
const savedCookie = cookie;
cookie = "";
ok((await call(`/api/transactions?month=${thisMonth}`)).status === 401, "signed-out requests are still rejected");
cookie = savedCookie;

const avg = (list: number[]) => Math.round(list.reduce((sum, value) => sum + value, 0) / list.length);
const max = (list: number[]) => Math.round(Math.max(...list));
console.log(`syncing with the bank:  average ${avg(syncTimes)} ms, slowest ${max(syncTimes)} ms`);
console.log(`ordinary page loads:    average ${avg(loadTimes)} ms, slowest ${max(loadTimes)} ms`);
ok(avg(loadTimes) < 300, `page loads average under 300 ms (was ${avg(loadTimes)})`);
console.log(`\nPERFORMANCE: ALL PASSED (${checks} checks)`);
