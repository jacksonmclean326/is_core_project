import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "test";

const { historyPollMs, idsToDelete, needsSync, staleAfterMs } = await import("../src/server/plaid/sync.ts");
const { categorizerVersion } = await import("../src/server/categorize.ts");
const { toPublicRow } = await import("../src/server/api/transactions.ts");
const { createTimer } = await import("../src/server/http/timing.ts");

const item = (patch: Record<string, unknown> = {}) => ({
  item_id: "i1",
  user_id: "u1",
  institution_name: "Bank",
  access_token_encrypted: "x",
  transactions_cursor: "cursor-1",
  transactions_synced_at: "2026-10-31T12:00:00Z",
  history_complete: true,
  categorizer_version: categorizerVersion,
  ...patch,
});
const at = (iso: string) => Date.parse(iso);

test("a bank is synced when it has never been synced", () => {
  assert.equal(needsSync(item({ transactions_synced_at: null, transactions_cursor: null }), at("2026-10-31T12:00:01Z")), true);
  assert.equal(needsSync(item({ transactions_synced_at: "not a date" }), at("2026-10-31T12:00:01Z")), true);
});

test("a fully imported bank is trusted for five minutes", () => {
  const base = at("2026-10-31T12:00:00Z");
  assert.equal(needsSync(item(), base + 1000), false);
  assert.equal(needsSync(item(), base + staleAfterMs), false, "still fresh at exactly the limit");
  assert.equal(needsSync(item(), base + staleAfterMs + 1), true, "stale just after");
});

test("a bank that is still importing history is checked every few seconds", () => {
  const base = at("2026-10-31T12:00:00Z");
  const importing = item({ history_complete: false });
  assert.equal(needsSync(importing, base + 1000), false);
  assert.equal(needsSync(importing, base + historyPollMs + 1), true);
  assert.ok(historyPollMs < staleAfterMs, "polls faster while importing");
});

test("a change in the sorting rules forces everything to be re-sorted", () => {
  const base = at("2026-10-31T12:00:00Z");
  assert.equal(needsSync(item({ categorizer_version: categorizerVersion - 1 }), base + 1), true);
  assert.equal(needsSync(item({ categorizer_version: 0 }), base + 1), true);
  assert.equal(needsSync(item({ categorizer_version: categorizerVersion + 1 }), base + 1), true, "a downgrade also re-sorts");
});

test("rows are deleted when Plaid removes them or they stop being spending", () => {
  const kept = new Set(["a", "b"]);
  assert.deepEqual(idsToDelete([], ["a", "b"], kept), []);
  assert.deepEqual(idsToDelete(["gone"], ["a"], kept), ["gone"]);
  assert.deepEqual(idsToDelete([], ["a", "refund"], kept), ["refund"], "changed into a refund: no longer spending");
  assert.deepEqual(idsToDelete(["x"], ["x"], new Set()), ["x"], "no duplicates");
  assert.deepEqual(idsToDelete([], [], kept), []);
});

test("saved rows become what the pages receive", () => {
  const bank = { transaction_id: "db-1", plaid_transaction_id: "plaid-1", name: "Cafe", amount: 4.5, date: "2026-10-05T00:00:00+00:00", category_key: "food", account_name: "Checking", institution_name: "Bank" };
  assert.deepEqual(toPublicRow(bank), { id: "plaid-1", name: "Cafe", amount: 4.5, date: "2026-10-05", category: "food", account: "Checking", institution: "Bank" });
  const manual = { ...bank, plaid_transaction_id: null, account_name: null, institution_name: null };
  assert.deepEqual(toPublicRow(manual), { id: "db-1", name: "Cafe", amount: 4.5, date: "2026-10-05", category: "food", account: "Manual entry", institution: "Manual", manual: true });
  assert.equal(toPublicRow({ ...bank, category_key: "c-deadbeef" }, new Set(["food", "other"])).category, "other", "a deleted category falls back to Other");
  assert.equal(toPublicRow({ ...bank, category_key: "food" }, new Set(["food", "other"])).category, "food");
  assert.equal(toPublicRow({ ...bank, category_key: null }).category, "other");
  assert.equal(toPublicRow({ ...bank, name: null, amount: null, date: null, account_name: null }).name, "Transaction");
});

test("the timer reports each step in the Server-Timing format", async () => {
  const timer = createTimer();
  const result = await timer.measure("lookup", async () => 42);
  assert.equal(result, 42);
  await assert.rejects(timer.measure("broken", async () => { throw new Error("x"); }), /x/);
  assert.match(timer.header(), /^lookup;dur=\d+\.\d, broken;dur=\d+\.\d$/);
});
