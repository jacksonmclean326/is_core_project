import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "test";

const { parseTransactionsQuery, summarizeMonths } = await import("../src/server/api/transactions.ts");
const { HttpError } = await import("../src/server/errors.ts");

const query = (qs: string, today = "2026-10-31") => parseTransactionsQuery(new URLSearchParams(qs), today);
const rejects = (qs: string, today?: string) =>
  assert.throws(() => query(qs, today), (error: unknown) => error instanceof HttpError && error.status === 400, qs);

const tx = (date: string, amount: number, category: string) =>
  ({ id: date + amount + category, name: "x", amount, date, category, account: "a", institution: "b" }) as never;

test("query defaults to the current month with no history", () => {
  assert.deepEqual(query(""), { month: "2026-10", history: 0 });
  assert.deepEqual(query("", "2027-01-01"), { month: "2027-01", history: 0 });
  assert.deepEqual(query("", "2028-02-29"), { month: "2028-02", history: 0 });
});

test("query accepts valid months and history", () => {
  assert.deepEqual(query("month=2026-09"), { month: "2026-09", history: 0 });
  assert.deepEqual(query("month=2026-10&history=5"), { month: "2026-10", history: 5 });
  assert.deepEqual(query("month=2026-01&history=0"), { month: "2026-01", history: 0 });
  assert.deepEqual(query("month=2026-10&history=12"), { month: "2026-10", history: 12 });
  // next month is tolerated so users whose clock is already tomorrow work
  assert.deepEqual(query("month=2026-11"), { month: "2026-11", history: 0 });
  assert.deepEqual(query("month=2027-01", "2026-12-31"), { month: "2027-01", history: 0 });
});

test("query rejects malformed, future, and too-old requests", () => {
  rejects("month=2026-13");
  rejects("month=2026-00");
  rejects("month=26-10");
  rejects("month=October");
  rejects("month=");
  rejects("month=2026-10-01");
  rejects("month=2026-12"); // two months ahead
  rejects("month=2030-01");
  rejects("month=2024-09"); // 25 months back
  rejects("month=2024-10&history=1"); // history reaches 25 months back
  rejects("month=2026-10&history=13");
  rejects("month=2026-10&history=-1");
  rejects("month=2026-10&history=2.5");
  rejects("month=2026-10&history=abc");
  rejects("month=2026-10&history=");
  assert.deepEqual(query("month=2024-10"), { month: "2024-10", history: 0 }); // exactly 24 months back
});

test("summaries bucket by calendar month using the transaction date", () => {
  const months = ["2026-09", "2026-10", "2026-11"];
  const result = summarizeMonths(
    [
      tx("2026-09-30", 10, "food"),
      tx("2026-10-01", 20, "food"),
      tx("2026-10-31", 5, "transport"),
      tx("2026-11-01", 7, "food"),
      tx("2026-08-31", 99, "food"), // outside the requested months
      tx("2026-12-01", 99, "food"),
    ],
    months,
  );
  assert.deepEqual(result.map((entry) => entry.month), months);
  assert.deepEqual(result.map((entry) => entry.total), [10, 25, 7]);
  assert.equal(result[1]?.byCategory.food, 20);
  assert.equal(result[1]?.byCategory.transport, 5);
  assert.equal(result[1]?.byCategory.housing, 0);
});

test("summaries cross the year boundary and leap day correctly", () => {
  const result = summarizeMonths(
    [tx("2026-12-31", 1, "other"), tx("2027-01-01", 2, "other"), tx("2028-02-29", 3, "food"), tx("2028-03-01", 4, "food")],
    ["2026-12", "2027-01", "2028-02", "2028-03"],
  );
  assert.deepEqual(result.map((entry) => entry.total), [1, 2, 3, 4]);
});

test("summaries add cents exactly (no floating point drift)", () => {
  const dime = Array.from({ length: 30 }, (_, index) => tx(`2026-10-${String(index + 1).padStart(2, "0")}`, 0.1, "food"));
  const [october] = summarizeMonths(dime, ["2026-10"]);
  assert.equal(october?.total, 3);
  assert.equal(october?.byCategory.food, 3);
  const [precise] = summarizeMonths([tx("2026-10-02", 103.44398, "food"), tx("2026-10-03", 0.005, "food")], ["2026-10"]);
  assert.equal(precise?.total, 103.45);
});

test("an empty or missing month still reports every category as zero", () => {
  const [empty] = summarizeMonths([], ["2026-10"]);
  assert.equal(empty?.total, 0);
  assert.equal(Object.keys(empty?.byCategory ?? {}).length, 7);
  assert.deepEqual(summarizeMonths([tx("2026-10-01", 5, "food")], []), []);
});

test("summaries include custom categories and any key seen in the data", () => {
  const months = ["2026-10"];
  const [october] = summarizeMonths(
    [tx("2026-10-02", 10, "c-aaaaaaaa"), tx("2026-10-03", 5, "food"), tx("2026-10-04", 2, "c-bbbbbbbb")],
    months,
    ["c-aaaaaaaa", "c-cccccccc"],
  );
  assert.equal(october?.total, 17);
  assert.equal(october?.byCategory["c-aaaaaaaa"], 10);
  assert.equal(october?.byCategory["c-cccccccc"], 0); // exists but empty
  assert.equal(october?.byCategory["c-bbbbbbbb"], 2); // unknown key still counted, never lost
  assert.equal(october?.byCategory.food, 5);
});
