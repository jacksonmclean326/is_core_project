// End-to-end check of manually added transactions, against the running server (npm start) and Supabase.
// Creates throwaway users (one later linked to the Plaid sandbox), then deletes everything it created.
//   node --env-file=.env --import tsx tests/manual.integration.mts
import assert from "node:assert/strict";
import { addDays, addMonths, monthEnd, monthKeyOfDate, utcDateString } from "../src/shared/months.ts";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const supabaseUrl = process.env.SUPABASE_URL!;
const adminHeaders = { apikey: process.env.SUPABASE_SECRET_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` };
let checks = 0;
const ok = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks += 1;
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const cents = (value: number) => Math.round(value * 100);

interface Session {
  id: string;
  call: (path: string, init?: RequestInit) => Promise<{ status: number; body: any }>;
}

async function signUp(label: string): Promise<Session> {
  let cookie = "";
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
    body: JSON.stringify({ email: `man.${label}.${Date.now()}@example.com`, password: "Man!Pass-2026-xyz", firstName: "Man", lastName: label, fullName: `Man ${label}` }),
  });
  assert.equal(signup.status, 200);
  return { id: signup.body.user.id, call };
}

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...adminHeaders, "Content-Type": "application/json", Prefer: "count=exact", ...init.headers } });

async function cleanup(user: Session) {
  const items = (await user.call("/api/plaid/accounts").catch(() => null))?.body?.connections ?? [];
  for (const item of items) await user.call(`/api/plaid/items/${item.id}`, { method: "DELETE" });
  for (const table of ["Merchant%20Rule", "Custom%20Category", "Transaction"]) await rest(`${table}?user_id=eq.${user.id}`, { method: "DELETE" });
  await rest(`User?user_id=eq.${user.id}`, { method: "DELETE" });
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: adminHeaders });
}

const users: Session[] = [];
try {
  const today = utcDateString();
  const thisMonth = monthKeyOfDate(today);
  const lastMonth = addMonths(thisMonth, -1);
  const twoAgo = addMonths(thisMonth, -2);
  const a = await signUp("a");
  users.push(a);

  // ---- no bank, nothing entered: sample data stays ---------------------------------------------------------------
  const empty = (await a.call(`/api/transactions?month=${lastMonth}`)).body;
  ok(empty.connected === false && empty.transactions.length === 0, "a new user with no bank and no entries gets the sample (connected=false)");

  // ---- validation ---------------------------------------------------------------------------------------------------------
  const add = (body: unknown) => a.call("/api/transactions/manual", { method: "POST", body: JSON.stringify(body) });
  const good = { name: "Corner Cafe", amount: 4.5, date: `${lastMonth}-15`, category: "food" };
  const bad = async (patch: Record<string, unknown>, why: string) => {
    const response = await add({ ...good, ...patch });
    ok(response.status === 400, `${why}: expected 400, got ${response.status} ${response.body?.error}`);
    ok(typeof response.body?.error === "string" && response.body.error.length > 0, `${why}: has an error message`);
  };
  await bad({ name: "" }, "empty name");
  await bad({ name: "x".repeat(61) }, "name too long");
  await bad({ name: "<script>" }, "markup in name");
  await bad({ amount: 0 }, "zero amount");
  await bad({ amount: -3 }, "negative amount");
  await bad({ amount: "abc" }, "text amount");
  await bad({ amount: 2_000_000 }, "huge amount");
  await bad({ amount: null }, "null amount");
  await bad({ date: "2026-02-30" }, "impossible date");
  await bad({ date: "not a date" }, "garbage date");
  await bad({ date: addDays(today, 5) }, "far future date");
  await bad({ date: `${addMonths(thisMonth, -30)}-01` }, "too old");
  await bad({ category: "nonsense" }, "unknown category");
  await bad({ category: "c-deadbeef" }, "missing custom category");
  await bad({ category: "../x" }, "malformed category");
  ok((await a.call("/api/transactions/manual", { method: "POST", body: "x", headers: { "Content-Type": "text/plain" } })).status === 415, "non-JSON rejected");
  ok((await a.call(`/api/transactions?month=${lastMonth}`)).body.connected === false, "rejected entries create nothing");

  // ---- adding ---------------------------------------------------------------------------------------------------------------------
  const custom = (await a.call("/api/categories", { method: "POST", body: JSON.stringify({ name: "Fun Money" }) })).body.category;
  const created = await add({ ...good, name: "  Corner   Cafe " });
  ok(created.status === 201, `create -> 201 (got ${created.status} ${created.body?.error})`);
  const cafe = created.body.transaction;
  ok(cafe.name === "Corner Cafe" && cafe.amount === 4.5 && cafe.date === `${lastMonth}-15` && cafe.category === "food", "stored fields are cleaned");
  ok(cafe.manual === true && cafe.account === "Manual entry" && cafe.institution === "Manual", "marked as manual");
  const lastDay = (await add({ name: "Month end", amount: 10.005, date: monthEnd(lastMonth), category: custom.key })).body.transaction;
  const firstDay = (await add({ name: "Month start", amount: 20, date: `${thisMonth}-01`, category: "transport" })).body.transaction;
  const older = (await add({ name: "Older", amount: 7.25, date: `${twoAgo}-10`, category: "other" })).body.transaction;
  ok(lastDay.amount === 10.01, "amounts round to cents: " + lastDay.amount);
  ok((await add({ name: "Tomorrow", amount: 1, date: addDays(today, 1), category: "food" })).status === 201, "tomorrow is allowed (clock skew)");
  ok((await add({ name: "Two years back", amount: 1, date: `${addMonths(thisMonth, -24)}-01`, category: "food" })).status === 201, "24 months back is allowed");

  // ---- reading: months, history, categories --------------------------------------------------------------------------------------
  const last = (await a.call(`/api/transactions?month=${lastMonth}&history=2`)).body;
  ok(last.connected === true, "with entries the pages switch to real data (connected=true)");
  ok(last.transactions.map((t: any) => t.name).sort().join("|") === "Corner Cafe|Month end", "last month holds exactly its own entries (incl. the last day)");
  ok(last.transactions[0].date >= last.transactions[1].date, "newest first");
  ok(JSON.stringify(last.history.map((h: any) => h.month)) === JSON.stringify([addMonths(lastMonth, -2), twoAgo, lastMonth]), "history lists three consecutive months, oldest first");
  const hist = Object.fromEntries(last.history.map((h: any) => [h.month, h]));
  ok(cents(hist[lastMonth].total) === cents(4.5) + cents(10.01), "last month total = 4.50 + 10.01");
  ok(hist[lastMonth].byCategory.food === 4.5 && hist[lastMonth].byCategory[custom.key] === 10.01, "split by category, including the custom one");
  ok(hist[twoAgo].total === 7.25 && hist[twoAgo].byCategory.other === 7.25, "two months ago");
  const current = (await a.call(`/api/transactions?month=${thisMonth}`)).body;
  ok(current.transactions.some((t: any) => t.id === firstDay.id), "an entry on the 1st lands in the new month, not the previous one");
  ok(!last.transactions.some((t: any) => t.id === firstDay.id), "…and not in last month");
  ok(!current.transactions.some((t: any) => t.id === lastDay.id), "an entry on the last day stays in its own month");

  // ---- editing ----------------------------------------------------------------------------------------------------------------------------
  const patch = (id: string, body: unknown) => a.call(`/api/transactions/manual/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  const moved = await patch(cafe.id, { category: custom.key });
  ok(moved.status === 200 && moved.body.transaction.category === custom.key, "move a manual entry to a custom category");
  const edited = await patch(cafe.id, { name: "Cafe Deluxe", amount: 6, date: `${twoAgo}-20` });
  ok(edited.status === 200 && edited.body.transaction.name === "Cafe Deluxe" && edited.body.transaction.date === `${twoAgo}-20`, "edit name, amount and date at once");
  const afterEdit = (await a.call(`/api/transactions?month=${lastMonth}&history=1`)).body;
  ok(!afterEdit.transactions.some((t: any) => t.id === cafe.id), "the edited entry left last month");
  ok(cents(afterEdit.history[0].total) === cents(7.25) + cents(6), "two-months-ago total includes it now");
  ok((await patch(cafe.id, {})).status === 400, "empty edit rejected");
  ok((await patch(cafe.id, { amount: -1 })).status === 400, "invalid edit rejected");
  ok((await patch(cafe.id, { date: "2030-01-01" })).status === 400, "far-future edit rejected");
  ok((await patch(cafe.id, { category: "c-deadbeef" })).status === 400, "unknown category edit rejected");
  ok((await patch("00000000-0000-0000-0000-000000000000", { name: "x" })).status === 404, "unknown id -> 404");
  ok((await patch("not-a-uuid", { name: "x" })).status === 404, "malformed id -> 404");

  // ---- isolation --------------------------------------------------------------------------------------------------------------------------------
  const b = await signUp("b");
  users.push(b);
  ok((await b.call(`/api/transactions?month=${lastMonth}`)).body.connected === false, "B sees none of A's entries");
  ok((await b.call(`/api/transactions/manual/${lastDay.id}`, { method: "PATCH", body: JSON.stringify({ name: "Hacked" }) })).status === 404, "B cannot edit A's entry");
  ok((await b.call(`/api/transactions/manual/${lastDay.id}`, { method: "DELETE" })).status === 404, "B cannot delete A's entry");
  ok((await b.call("/api/transactions/manual", { method: "POST", body: JSON.stringify({ ...good, category: custom.key }) })).status === 400, "B cannot file an entry under A's category");
  ok((await patch(lastDay.id, { name: "Month end" })).status === 200, "A's entry is untouched and still editable");

  // ---- deleting a custom category moves manual entries to Other -----------------------------------------------------------------
  ok((await a.call(`/api/categories/${custom.key}`, { method: "DELETE" })).status === 200, "delete the custom category");
  const afterCat = (await a.call(`/api/transactions?month=${lastMonth}`)).body;
  ok(afterCat.transactions.find((t: any) => t.id === lastDay.id).category === "other", "its manual entries landed in Other");

  // ---- deleting an entry ------------------------------------------------------------------------------------------------------------------------
  ok((await a.call(`/api/transactions/manual/${older.id}`, { method: "DELETE" })).body.ok === true, "delete works");
  ok((await a.call(`/api/transactions/manual/${older.id}`, { method: "DELETE" })).status === 404, "deleting twice -> 404");
  const gone = (await a.call(`/api/transactions?month=${twoAgo}`)).body;
  ok(!gone.transactions.some((t: any) => t.id === older.id), "deleted entries disappear");
  const anon = await fetch(`${base}/api/transactions/manual`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(good) });
  ok(anon.status === 401, "signed-out requests are rejected");

  // ---- link a bank: manual entries and bank data combine -------------------------------------------------------------------------------
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
  ok((await a.call("/api/plaid/exchange", { method: "POST", body: JSON.stringify({ publicToken, institutionId: "ins_109508", institutionName: "First Platypus Bank" }) })).status === 200, "bank linked on top of manual entries");
  let combined: any;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    combined = (await a.call(`/api/transactions?month=${lastMonth}&history=1`)).body;
    if (combined.transactions.filter((t: any) => !t.manual).length > 10 && !combined.warning?.startsWith("Some bank")) break;
    await wait(3000);
  }
  const bank = combined.transactions.filter((t: any) => !t.manual);
  const mine = combined.transactions.filter((t: any) => t.manual);
  ok(bank.length > 10, "bank transactions are there");
  ok(mine.length === 1 && mine[0].id === lastDay.id, "so is the manual entry");
  const bankSum = bank.reduce((sum: number, t: any) => sum + cents(t.amount), 0);
  ok(cents(combined.history[1].total) === bankSum + cents(10.01), "month total = bank + manual");
  // a fresh pull from Plaid must never delete or alter manual rows
  for (let round = 0; round < 3; round += 1) await a.call(`/api/transactions?month=${lastMonth}&history=3`);
  const stillThere = await (await rest(`Transaction?select=transaction_id,name&user_id=eq.${a.id}&plaid_transaction_id=is.null`)).json();
  ok(stillThere.some((r: any) => r.transaction_id === lastDay.id), "refreshing from Plaid keeps manual rows");
  // merchant rules apply to bank transactions only
  const target = bank[0];
  await add({ name: target.name, amount: 1.23, date: `${lastMonth}-02`, category: "other" });
  await a.call("/api/transactions/category", { method: "PUT", body: JSON.stringify({ transactionId: target.id, category: "education", applyToMerchant: true }) });
  const ruled = (await a.call(`/api/transactions?month=${lastMonth}`)).body;
  const manualSameName = ruled.transactions.find((t: any) => t.manual && t.name === target.name);
  ok(manualSameName.category === "other", "a merchant rule does not touch manual entries with the same name");
  ok(ruled.transactions.find((t: any) => t.id === target.id).category === "education", "…but moves the bank transaction");
  // manual rows can be recategorized with the same dropdown the page uses for bank rows
  ok((await patch(manualSameName.id, { category: "personal" })).body.transaction.category === "personal", "manual entries can be moved between categories");
  ok((await a.call("/api/transactions/category", { method: "PUT", body: JSON.stringify({ transactionId: manualSameName.id, category: "food" }) })).status === 404, "the bank-transaction endpoint refuses manual ids");

  console.log(`\nMANUAL: ALL PASSED (${checks} checks)`);
} catch (error) {
  console.log(`\nMANUAL FAILURE after ${checks} checks:`, (error as Error).message);
  process.exitCode = 1;
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
