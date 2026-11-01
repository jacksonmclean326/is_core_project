// Checks that the fast path (remembered bank data, background saves) returns exactly the same data
// as asking Plaid every time, and is much quicker. Read-only: it signs in to an account that already
// has a bank linked for more than 10 minutes (banks linked more recently are deliberately not remembered).
//   $env:DEMO_EMAIL="..."; $env:DEMO_PASSWORD="..."
//   node --env-file=.env --import tsx tests/performance.integration.mts
import assert from "node:assert/strict";
import { addMonths, monthKeyOfDate, utcDateString } from "../src/shared/months.ts";

const email = process.env.DEMO_EMAIL;
const password = process.env.DEMO_PASSWORD;
if (!email || !password) {
  console.log("SKIPPED: set DEMO_EMAIL and DEMO_PASSWORD to an account with a bank linked more than 10 minutes ago.");
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
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(path: string, init: RequestInit = {}) {
  const start = performance.now();
  const response = await fetch(base + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
  });
  const set = response.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((value) => value.split(";")[0]).join("; ");
  const body = await response.json().catch(() => null);
  const timing = response.headers.get("server-timing") ?? "";
  return { ms: performance.now() - start, status: response.status, body, askedPlaid: /(^|, )plaid;/.test(timing), timing };
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

// 1. a deliberate fresh pull from Plaid is the reference answer
const reference = new Map<string, any>();
const coldTimes: number[] = [];
for (const query of queries) {
  const result = await call(`/api/transactions?${query}&refresh=1`);
  ok(result.status === 200, `${query}: fresh pull ok`);
  ok(result.askedPlaid, `${query}: refresh=1 really asked Plaid`);
  reference.set(query, result.body);
  coldTimes.push(result.ms);
}
await wait(2500); // let the background save finish
const rowsAfterFresh = await rowCount();
ok(rowsAfterFresh > 0, `transactions are saved in the database (${rowsAfterFresh} rows)`);

// 2. the fast path must return exactly the same data and not ask Plaid
const warmTimes: number[] = [];
for (let round = 0; round < 3; round += 1) {
  for (const query of queries) {
    const result = await call(`/api/transactions?${query}`);
    ok(result.status === 200, `${query}: ok`);
    ok(!result.askedPlaid, `${query}: served without asking Plaid`);
    assert.deepEqual(result.body, reference.get(query), `${query}: same data as a fresh pull`);
    checks += 1;
    warmTimes.push(result.ms);
  }
}

// 3. repeating reads and fresh pulls never changes what is saved (only differences are written)
await call(`/api/transactions?month=${thisMonth}&history=5&refresh=1`);
await wait(2500);
ok((await rowCount()) === rowsAfterFresh, "a repeat pull leaves the saved rows exactly as they were");

// 4. the remembered copy does not serve data to a signed-out visitor
const savedCookie = cookie;
cookie = "";
ok((await call(`/api/transactions?month=${thisMonth}`)).status === 401, "signed-out requests are still rejected");
cookie = savedCookie;

const avg = (list: number[]) => Math.round(list.reduce((sum, value) => sum + value, 0) / list.length);
const max = (list: number[]) => Math.round(Math.max(...list));
console.log(`fresh pulls from Plaid: average ${avg(coldTimes)} ms, slowest ${max(coldTimes)} ms`);
console.log(`remembered (fast path): average ${avg(warmTimes)} ms, slowest ${max(warmTimes)} ms`);
ok(avg(warmTimes) < 400, `the fast path averages under 400 ms (was ${avg(warmTimes)})`);
ok(avg(warmTimes) < avg(coldTimes) / 2, "the fast path is at least twice as quick as asking Plaid");
console.log(`\nPERFORMANCE: ALL PASSED (${checks} checks)`);
