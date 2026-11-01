// End-to-end check of custom categories and recategorizing, against the running server (npm start),
// the real Plaid sandbox and Supabase. Needs supabase/migrations/20261102_custom_categories.sql applied.
// Creates two throwaway users, then deletes everything it created.
//   node --env-file=.env --import tsx tests/categories.integration.mts
import assert from "node:assert/strict";
import { normalizeMerchant } from "../src/server/categorize.ts";
import { addMonths, monthKeyOfDate, utcDateString } from "../src/shared/months.ts";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const supabaseUrl = process.env.SUPABASE_URL!;
const adminHeaders = { apikey: process.env.SUPABASE_SECRET_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` };
let checks = 0;
const ok = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Session {
  id: string;
  email: string;
  call: (path: string, init?: RequestInit) => Promise<{ status: number; body: any }>;
}

async function signUp(label: string): Promise<Session> {
  let cookie = "";
  const email = `cat.${label}.${Date.now()}@example.com`;
  const call = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(base + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
    });
    const set = response.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((value) => value.split(";")[0]).join("; ");
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  const signup = await call("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password: "Cat!Pass-2026-xyz", firstName: "Cat", lastName: label, fullName: `Cat ${label}` }),
  });
  assert.equal(signup.status, 200);
  return { id: signup.body.user.id, email, call };
}

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...adminHeaders, "Content-Type": "application/json", Prefer: "count=exact", ...init.headers } });

async function cleanup(user: Session) {
  const items = (await user.call("/api/plaid/accounts").catch(() => null))?.body?.connections ?? [];
  for (const item of items) await user.call(`/api/plaid/items/${item.id}`, { method: "DELETE" });
  for (const table of ["Merchant%20Rule", "Custom%20Category", "Transaction"]) {
    await rest(`${table}?user_id=eq.${user.id}`, { method: "DELETE" });
  }
  await rest(`User?user_id=eq.${user.id}`, { method: "DELETE" });
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: adminHeaders });
}

const users: Session[] = [];
try {
  const a = await signUp("a");
  users.push(a);

  const probe = await a.call("/api/categories");
  if (probe.status !== 200) {
    console.log(`SKIPPED: /api/categories returned ${probe.status} (${probe.body?.error}). Apply supabase/migrations/20261102_custom_categories.sql first.`);
    process.exitCode = 2;
    throw new Error("migration not applied");
  }
  ok(Array.isArray(probe.body.categories) && probe.body.categories.length === 0, "a new user has no custom categories");

  // ---- link the sandbox bank and load a month --------------------------------------------------------------------
  const publicToken = (
    await (
      await fetch("https://sandbox.plaid.com/sandbox/public_token/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.CLIENT_ID, secret: process.env.PLAID_SECRET, institution_id: "ins_109508",
          initial_products: ["transactions"], options: { override_username: "user_transactions_dynamic" },
        }),
      })
    ).json()
  ).public_token;
  ok((await a.call("/api/plaid/exchange", { method: "POST", body: JSON.stringify({ publicToken, institutionId: "ins_109508", institutionName: "First Platypus Bank" }) })).status === 200, "bank linked");
  const testMonth = addMonths(monthKeyOfDate(utcDateString()), -1); // last month: the sandbox has plenty of data there
  let loaded: any;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    loaded = (await a.call(`/api/transactions?month=${testMonth}&history=2&refresh=1`)).body;
    if (loaded?.transactions?.length && loaded.syncing === false && !loaded.warning) break; // wait for Plaid's full import
    await wait(3000);
  }
  ok(loaded.transactions.length > 10, "sandbox month loaded");
  const monthTotal = (response: any) => Math.round(response.transactions.reduce((sum: number, t: any) => sum + Math.round(t.amount * 100), 0));
  const byCategory = (response: any, key: string) => response.transactions.filter((t: any) => t.category === key);
  const baselineTotal = monthTotal(loaded);

  // ---- creating categories -----------------------------------------------------------------------------------------
  const created = await a.call("/api/categories", { method: "POST", body: JSON.stringify({ name: "  Eating   Out " }) });
  ok(created.status === 201, `create -> 201 (got ${created.status} ${created.body?.error})`);
  const eating = created.body.category;
  ok(/^c-[0-9a-f]{8}$/.test(eating.key), "key looks like c-xxxxxxxx: " + eating.key);
  ok(eating.name === "Eating Out", "name is trimmed and collapsed: " + eating.name);
  ok(/^#[0-9a-f]{6}$/i.test(eating.color), "has a color");
  const second = (await a.call("/api/categories", { method: "POST", body: JSON.stringify({ name: "Side Hustle" }) })).body.category;
  ok(second.color !== eating.color, "colors differ between categories");

  const bad = async (name: unknown, status: number, why: string) => {
    const response = await a.call("/api/categories", { method: "POST", body: JSON.stringify({ name }) });
    ok(response.status === status, `${why}: expected ${status}, got ${response.status} ${response.body?.error}`);
    ok(typeof response.body?.error === "string", `${why}: has an error message`);
  };
  await bad("eating out", 409, "duplicate (case-insensitive)");
  await bad("FOOD", 409, "collides with a built-in name");
  await bad("other", 409, "collides with Other");
  await bad("", 400, "empty name");
  await bad("   ", 400, "blank name");
  await bad("x".repeat(25), 400, "too long");
  await bad("<b>hi</b>", 400, "markup");
  await bad(42, 400, "not a string");
  ok((await a.call("/api/categories", { method: "POST", body: "not json", headers: { "Content-Type": "text/plain" } })).status === 415, "non-JSON body rejected");

  const renamed = await a.call(`/api/categories/${eating.key}`, { method: "PATCH", body: JSON.stringify({ name: "Dining" }) });
  ok(renamed.status === 200 && renamed.body.category.name === "Dining", "rename works");
  ok((await a.call(`/api/categories/${eating.key}`, { method: "PATCH", body: JSON.stringify({ name: "side hustle" }) })).status === 409, "rename to an existing name rejected");
  ok((await a.call(`/api/categories/${eating.key}`, { method: "PATCH", body: JSON.stringify({ name: "Dining" }) })).status === 200, "renaming to its own name is fine");
  ok((await a.call(`/api/categories/c-00000000`, { method: "PATCH", body: JSON.stringify({ name: "Nope" }) })).status === 404, "rename unknown key -> 404");
  ok((await a.call(`/api/categories/food`, { method: "PATCH", body: JSON.stringify({ name: "Nope" }) })).status === 404, "built-ins cannot be renamed on the server");
  ok((await a.call(`/api/categories/c-00000000`, { method: "DELETE" })).status === 404, "delete unknown key -> 404");

  const listed = (await a.call("/api/categories")).body.categories.map((c: any) => c.name);
  ok(JSON.stringify(listed) === JSON.stringify(["Dining", "Side Hustle"]), "list in creation order: " + listed);
  const withCustoms = (await a.call(`/api/transactions?month=${testMonth}`)).body;
  ok(withCustoms.customCategories.length === 2, "transactions response carries the custom categories");

  // ---- recategorize one transaction --------------------------------------------------------------------------------
  const groups = new Map<string, any[]>();
  for (const t of loaded.transactions) groups.set(normalizeMerchant(t.name), [...(groups.get(normalizeMerchant(t.name)) ?? []), t]);
  const uniform = [...groups.entries()]
    .filter(([, list]) => list.every((t) => t.category === list[0].category))
    .sort((x, y) => y[1].length - x[1].length);
  console.log("merchants with several transactions:", uniform.filter(([, l]) => l.length >= 2).map(([k, l]) => `${k}(${l.length})`).join(", "));
  // the biggest merchant is used for the whole-merchant move, the next one with 2+ for the single move
  const [secondMerchant, secondList] = uniform[0]!;
  const [firstMerchant, firstList] = uniform.find(([key, list], index) => index > 0 && list.length >= 2 && key !== secondMerchant)!;
  ok(secondList.length >= 3, `largest merchant has 3+ transactions (${secondList.length})`);
  ok(firstList.length >= 2, `another merchant has 2+ transactions (${firstList.length})`);
  void firstMerchant;
  const one = firstList[0];
  const fromCategory = one.category;

  const single = await a.call("/api/transactions/category", { method: "PUT", body: JSON.stringify({ transactionId: one.id, category: eating.key, applyToMerchant: false }) });
  ok(single.status === 200 && single.body.moved === 1, "single move reports 1");
  let after = (await a.call(`/api/transactions?month=${testMonth}&history=2`)).body;
  ok(after.transactions.find((t: any) => t.id === one.id).category === eating.key, "the chosen transaction moved");
  ok(firstList.slice(1).every((s: any) => after.transactions.find((t: any) => t.id === s.id).category === fromCategory), "its siblings did not move");
  ok(monthTotal(after) === baselineTotal, "the month total is unchanged by moving");
  const customTotal = after.history.at(-1).byCategory[eating.key];
  ok(Math.round(customTotal * 100) === Math.round(one.amount * 100), "history summary shows the moved amount in the custom category");
  ok(after.history.at(-1).byCategory[second.key] === 0, "an empty custom category appears with zero");

  // ---- recategorize a whole merchant, including future fetches --------------------------------------------------
  const bulk = await a.call("/api/transactions/category", { method: "PUT", body: JSON.stringify({ transactionId: secondList[0].id, category: second.key, applyToMerchant: true }) });
  ok(bulk.status === 200 && bulk.body.moved >= secondList.length, `merchant move reports at least ${secondList.length} (got ${bulk.body.moved})`);
  after = (await a.call(`/api/transactions?month=${testMonth}`)).body;
  ok(secondList.every((s: any) => after.transactions.find((t: any) => t.id === s.id).category === second.key), "every transaction from that merchant moved");
  ok(monthTotal(after) === baselineTotal, "total still unchanged");
  const refetched = (await a.call(`/api/transactions?month=${testMonth}&refresh=1`)).body; // sync with Plaid now
  ok(secondList.every((s: any) => refetched.transactions.find((t: any) => t.id === s.id).category === second.key), "the choice survives a sync with Plaid");
  // the strongest test: throw away what is saved and re-sort everything from Plaid from scratch
  const itemRow = (await (await rest(`Plaid%20Item?select=item_id&user_id=eq.${a.id}`)).json())[0];
  await rest(`Plaid%20Item?item_id=eq.${itemRow.item_id}`, { method: "PATCH", body: JSON.stringify({ transactions_cursor: null, categorizer_version: 0 }) });
  const resorted = (await a.call(`/api/transactions?month=${testMonth}&refresh=1`)).body;
  ok(resorted.transactions.length === refetched.transactions.length, "a from-scratch re-sort finds the same transactions");
  ok(secondList.every((s: any) => resorted.transactions.find((t: any) => t.id === s.id).category === second.key), "merchant rules survive a from-scratch re-sort");
  ok(resorted.transactions.find((t: any) => t.id === one.id).category === eating.key, "single manual picks survive a from-scratch re-sort");
  if (monthTotal(resorted) !== monthTotal(refetched)) {
    const before = new Map(refetched.transactions.map((t: any) => [t.id, t]));
    const differences = resorted.transactions
      .filter((t: any) => before.get(t.id)?.amount !== t.amount || before.get(t.id)?.date !== t.date)
      .map((t: any) => `${t.name} ${before.get(t.id)?.amount}@${before.get(t.id)?.date} -> ${t.amount}@${t.date}`);
    console.log("transactions that changed between the two syncs:", differences.slice(0, 10));
  }
  ok(monthTotal(resorted) === monthTotal(refetched), "totals are unchanged by a from-scratch re-sort");
  const itemAfter = (await (await rest(`Plaid%20Item?select=categorizer_version,transactions_cursor&item_id=eq.${itemRow.item_id}`)).json())[0];
  ok(itemAfter.categorizer_version > 0 && itemAfter.transactions_cursor, "the sync remembers where it got to");
  const ruleRows = await (await rest(`Merchant%20Rule?select=merchant_key,category_key&user_id=eq.${a.id}`)).json();
  ok(ruleRows.some((r: any) => r.merchant_key === secondMerchant && r.category_key === second.key), "a rule was remembered for the merchant");

  // a manual pick beats the merchant rule
  const exception = secondList[1];
  await a.call("/api/transactions/category", { method: "PUT", body: JSON.stringify({ transactionId: exception.id, category: eating.key, applyToMerchant: false }) });
  after = (await a.call(`/api/transactions?month=${testMonth}`)).body;
  ok(after.transactions.find((t: any) => t.id === exception.id).category === eating.key, "manual pick beats the merchant rule");
  ok(secondList.filter((s: any) => s.id !== exception.id).every((s: any) => after.transactions.find((t: any) => t.id === s.id).category === second.key), "the rest keep following the rule");
  const manualRows = await (await rest(`Transaction?select=plaid_transaction_id&user_id=eq.${a.id}&category_manual=eq.true`)).json();
  ok(manualRows.some((r: any) => r.plaid_transaction_id === exception.id), "manual picks are flagged in the database");

  // history months other than the current one are covered too
  const wider = (await a.call(`/api/transactions?month=${testMonth}&history=2`)).body;
  const sumAll = wider.history.reduce((sum: number, h: any) => sum + Math.round(h.total * 100), 0);
  const sumByKeys = wider.history.reduce((sum: number, h: any) => sum + Object.values(h.byCategory).reduce((x: number, v: any) => x + Math.round(v * 100), 0), 0);
  ok(sumAll === sumByKeys, "per-category amounts add up to each month total");

  // ---- validation of recategorizing -----------------------------------------------------------------------------------
  const move = (body: unknown) => a.call("/api/transactions/category", { method: "PUT", body: JSON.stringify(body) });
  ok((await move({ transactionId: one.id, category: "nonsense" })).status === 400, "unknown category rejected");
  ok((await move({ transactionId: one.id, category: "c-deadbeef" })).status === 400, "someone else's / missing custom key rejected");
  ok((await move({ transactionId: one.id, category: "../x" })).status === 400, "malformed key rejected");
  ok((await move({ transactionId: one.id })).status === 400, "missing category rejected");
  ok((await move({ category: "food" })).status === 400, "missing transaction rejected");
  ok((await move({ transactionId: "does-not-exist", category: "food" })).status === 404, "unknown transaction -> 404");
  ok((await move({ transactionId: one.id, category: "food", applyToMerchant: "yes" })).status === 200, "non-boolean applyToMerchant is treated as false");

  // ---- a second user cannot see or touch the first user's data ------------------------------------------------------------
  const b = await signUp("b");
  users.push(b);
  ok((await b.call("/api/categories")).body.categories.length === 0, "user B sees no custom categories of A");
  ok((await b.call("/api/transactions/category", { method: "PUT", body: JSON.stringify({ transactionId: one.id, category: "food" }) })).status === 404, "B cannot move A's transaction");
  ok((await b.call("/api/transactions/category", { method: "PUT", body: JSON.stringify({ transactionId: one.id, category: eating.key }) })).status === 400, "B cannot use A's category key");
  ok((await b.call(`/api/categories/${eating.key}`, { method: "DELETE" })).status === 404, "B cannot delete A's category");
  ok((await b.call(`/api/categories/${eating.key}`, { method: "PATCH", body: JSON.stringify({ name: "Hacked" }) })).status === 404, "B cannot rename A's category");
  ok((await a.call("/api/categories")).body.categories.find((c: any) => c.key === eating.key).name === "Dining", "A's category is untouched");
  const bCreated = await b.call("/api/categories", { method: "POST", body: JSON.stringify({ name: "Dining" }) });
  ok(bCreated.status === 201, "B can use the same name as A (names are per user)");

  // ---- the 12-category limit ---------------------------------------------------------------------------------------------
  for (let index = 3; index <= 12; index += 1) {
    ok((await a.call("/api/categories", { method: "POST", body: JSON.stringify({ name: `Extra ${index}` }) })).status === 201, `create #${index}`);
  }
  ok((await a.call("/api/categories", { method: "POST", body: JSON.stringify({ name: "One too many" }) })).status === 400, "13th category rejected");

  // ---- deleting a category sends its transactions to Other ---------------------------------------------------------------
  const beforeDelete = (await a.call(`/api/transactions?month=${testMonth}`)).body;
  const inSecond = byCategory(beforeDelete, second.key).map((t: any) => t.id);
  ok(inSecond.length >= secondList.length - 1, "there is something to move");
  ok((await a.call(`/api/categories/${second.key}`, { method: "DELETE" })).status === 200, "delete works");
  const afterDelete = (await a.call(`/api/transactions?month=${testMonth}&history=2`)).body;
  ok(inSecond.every((id: string) => afterDelete.transactions.find((t: any) => t.id === id).category === "other"), "its transactions landed in Other");
  // compare with a reading taken just before (the sandbox's dynamic test user keeps changing over time)
  ok(monthTotal(afterDelete) === monthTotal(beforeDelete), "total unchanged after delete");
  ok(!afterDelete.customCategories.some((c: any) => c.key === second.key), "category is gone from the list");
  ok(!(await (await rest(`Merchant%20Rule?select=category_key&user_id=eq.${a.id}`)).json()).some((r: any) => r.category_key === second.key), "its merchant rules are gone");
  ok(afterDelete.history.every((h: any) => !(second.key in h.byCategory) || h.byCategory[second.key] === 0), "no money is left in the deleted category");

  // ---- stored rows follow the final choices ------------------------------------------------------------------------------------
  const stored = await (await rest(`Transaction?select=plaid_transaction_id,category_key&user_id=eq.${a.id}`)).json();
  const storedMap = new Map(stored.map((r: any) => [r.plaid_transaction_id, r.category_key]));
  const latest = (await a.call(`/api/transactions?month=${testMonth}`)).body;
  ok(latest.transactions.every((t: any) => storedMap.get(t.id) === t.category), "the database agrees with what the page shows");

  console.log(`\nCATEGORIES: ALL PASSED (${checks} checks)`);
} catch (error) {
  if ((error as Error).message !== "migration not applied") {
    console.log(`\nCATEGORIES FAILURE after ${checks} checks:`, (error as Error).message);
    process.exitCode = 1;
  }
} finally {
  for (const user of users) await cleanup(user).catch((error) => console.log("cleanup error", error.message));
  const left = await Promise.all(
    users.map(async (user) =>
      (await Promise.all(["Transaction", "Income%20Source", "Plaid%20Item", "User", "Custom%20Category", "Merchant%20Rule"].map(async (table) =>
        Number((await rest(`${table}?select=*&user_id=eq.${user.id}`, { method: "HEAD" })).headers.get("content-range")?.split("/")[1] ?? 0)))).reduce((x, y) => x + y, 0),
    ),
  );
  console.log(left.every((count) => count === 0) ? "cleanup: test users and all their rows removed" : `cleanup INCOMPLETE: ${left.join(",")}`);
}
