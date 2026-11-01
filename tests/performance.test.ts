import assert from "node:assert/strict";
import { test } from "node:test";
import type { Transaction } from "plaid";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "test";

const { cacheSize, cacheTtlMs, invalidateCache, readCache, writeCache } = await import("../src/server/plaid/cache.ts");
const { planStoreChanges } = await import("../src/server/api/transactions.ts");
const { enqueueStore, settleStores } = await import("../src/server/api/store-queue.ts");
const { createTimer } = await import("../src/server/http/timing.ts");

const pull = (start: string, end: string, fetchedAt: number) => ({ start, end, fetchedAt, transactions: [] as Transaction[], accounts: [] });

test("a cached bank pull is reused only while fresh and only for ranges it covers", () => {
  invalidateCache();
  const t0 = 1_000_000;
  writeCache("item-1", pull("2026-05-01", "2026-10-31", t0));
  assert.ok(readCache("item-1", "2026-05-01", "2026-10-31", t0 + 1000), "same range, fresh");
  assert.ok(readCache("item-1", "2026-09-01", "2026-09-30", t0 + 1000), "a narrower range inside it");
  assert.equal(readCache("item-1", "2026-04-01", "2026-10-31", t0 + 1000), undefined, "starts earlier than the pull");
  assert.equal(readCache("item-1", "2026-05-01", "2026-11-01", t0 + 1000), undefined, "ends later than the pull (a new day)");
  assert.equal(readCache("item-2", "2026-09-01", "2026-09-30", t0 + 1000), undefined, "a different bank connection");
  assert.ok(readCache("item-1", "2026-09-01", "2026-09-30", t0 + cacheTtlMs), "still fresh at exactly the limit");
  assert.equal(readCache("item-1", "2026-09-01", "2026-09-30", t0 + cacheTtlMs + 1), undefined, "expired");
  assert.equal(readCache("item-1", "2026-09-01", "2026-09-30", t0 + 2), undefined, "an expired entry is gone for good");
});

test("the cache can be cleared per bank connection and is bounded", () => {
  invalidateCache();
  writeCache("a", pull("2026-05-01", "2026-10-31", Date.now()));
  writeCache("b", pull("2026-05-01", "2026-10-31", Date.now()));
  invalidateCache("a");
  assert.equal(readCache("a", "2026-09-01", "2026-09-30"), undefined);
  assert.ok(readCache("b", "2026-09-01", "2026-09-30"));
  invalidateCache();
  assert.equal(cacheSize(), 0);
  for (let index = 0; index < 150; index += 1) writeCache(`item-${index}`, pull("2026-05-01", "2026-10-31", Date.now()));
  assert.equal(cacheSize(), 100, "never grows past 100 connections");
  assert.equal(readCache("item-0", "2026-09-01", "2026-09-30"), undefined, "oldest entries are dropped first");
  assert.ok(readCache("item-149", "2026-09-01", "2026-09-30"), "newest is kept");
  invalidateCache();
});

const row = (id: string, patch: Record<string, unknown> = {}) => ({
  user_id: "u",
  plaid_transaction_id: id,
  name: "Cafe",
  amount: 4.5,
  date: "2026-10-05T00:00:00Z",
  category_key: "food",
  account_name: "Checking",
  institution_name: "Bank",
  source_id: "s1",
  ...patch,
});
const saved = (id: string, patch: Record<string, unknown> = {}) => ({
  transaction_id: `db-${id}`,
  plaid_transaction_id: id,
  name: "Cafe",
  amount: 4.5,
  date: "2026-10-05T00:00:00+00:00",
  category_key: "food",
  account_name: "Checking",
  institution_name: "Bank",
  source_id: "s1",
  ...patch,
});

test("only new or changed transactions are written, and vanished ones are removed", () => {
  const unchanged = planStoreChanges([saved("a"), saved("b")], [row("a"), row("b")]);
  assert.equal(unchanged.upserts.length, 0, "nothing to write when nothing changed");
  assert.equal(unchanged.staleIds.length, 0);

  const added = planStoreChanges([saved("a")], [row("a"), row("b")]);
  assert.deepEqual(added.upserts.map((r) => r.plaid_transaction_id), ["b"]);

  const removed = planStoreChanges([saved("a"), saved("b")], [row("a")]);
  assert.deepEqual(removed.staleIds, ["db-b"]);
  assert.equal(removed.upserts.length, 0);

  for (const [field, value] of [
    ["name", "Other"], ["amount", 5], ["date", "2026-10-06T00:00:00Z"], ["category_key", "other"],
    ["account_name", "Savings"], ["institution_name", "Bank 2"], ["source_id", null],
  ] as const) {
    const changed = planStoreChanges([saved("a")], [row("a", { [field]: value })]);
    assert.deepEqual(changed.upserts.map((r) => r.plaid_transaction_id), ["a"], `a changed ${field} is written`);
  }
  // the database returns timestamps in a different format than we send; that alone is not a change
  assert.equal(planStoreChanges([saved("a", { date: "2026-10-05T00:00:00.000+00:00" })], [row("a")]).upserts.length, 0);
  assert.equal(planStoreChanges([], []).upserts.length, 0);
});

test("saves for one user run one at a time and can be waited for", async () => {
  const order: string[] = [];
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  enqueueStore("u1", async () => {
    order.push("first start");
    await wait(30);
    order.push("first end");
  });
  enqueueStore("u1", async () => {
    order.push("second");
  });
  enqueueStore("u2", async () => {
    order.push("other user");
  });
  await settleStores("u1");
  assert.deepEqual(order.filter((entry) => entry !== "other user"), ["first start", "first end", "second"], "same-user saves never overlap");
  assert.ok(order.includes("other user"), "other users are not blocked");
  await settleStores("nobody"); // nothing queued: returns immediately
});

test("a failing save does not break the next one", async () => {
  const ran: string[] = [];
  enqueueStore("u3", async () => {
    throw new Error("database down");
  });
  enqueueStore("u3", async () => {
    ran.push("after failure");
  });
  await settleStores("u3");
  assert.deepEqual(ran, ["after failure"]);
});

test("the timer reports each step in the Server-Timing format", async () => {
  const timer = createTimer();
  const result = await timer.measure("lookup", async () => 42);
  assert.equal(result, 42);
  await assert.rejects(timer.measure("broken", async () => { throw new Error("x"); }), /x/);
  const header = timer.header();
  assert.match(header, /^lookup;dur=\d+\.\d, broken;dur=\d+\.\d$/);
});
