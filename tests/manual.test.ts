import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "test";

const { cleanAmount, cleanDate, cleanDescription, dateAllowed, toPublicManual } = await import("../src/server/api/manual-transactions.ts");
const { HttpError } = await import("../src/server/errors.ts");

const rejects = (action: () => unknown, label: string) =>
  assert.throws(action, (error: unknown) => error instanceof HttpError && error.status === 400, label);

test("descriptions are trimmed, collapsed and validated", () => {
  assert.equal(cleanDescription("  Corner   Cafe "), "Corner Cafe");
  assert.equal(cleanDescription("a".repeat(60)).length, 60);
  rejects(() => cleanDescription(""), "empty");
  rejects(() => cleanDescription("   "), "blank");
  rejects(() => cleanDescription("a".repeat(61)), "too long");
  rejects(() => cleanDescription("<img onerror=1>"), "markup");
  rejects(() => cleanDescription(undefined), "missing");
  rejects(() => cleanDescription(5), "number");
});

test("amounts are positive dollars rounded to cents", () => {
  assert.equal(cleanAmount(12.5), 12.5);
  assert.equal(cleanAmount("12.50"), 12.5);
  assert.equal(cleanAmount("  7 "), 7);
  assert.equal(cleanAmount(0.01), 0.01);
  assert.equal(cleanAmount(10.005), 10.01);
  assert.equal(cleanAmount(0.1 + 0.2), 0.3);
  assert.equal(cleanAmount(1_000_000), 1_000_000);
  rejects(() => cleanAmount(0), "zero");
  rejects(() => cleanAmount(0.004), "rounds to zero");
  rejects(() => cleanAmount(-5), "negative");
  rejects(() => cleanAmount(1_000_000.01), "too large");
  rejects(() => cleanAmount(Number.NaN), "NaN");
  rejects(() => cleanAmount(Infinity), "Infinity");
  rejects(() => cleanAmount(""), "empty string");
  rejects(() => cleanAmount("abc"), "text");
  rejects(() => cleanAmount(null), "null");
  rejects(() => cleanAmount(undefined), "missing");
  rejects(() => cleanAmount("12,50"), "comma decimal");
});

test("dates must be real, recent, and not beyond tomorrow", () => {
  const today = "2026-10-31";
  assert.equal(dateAllowed("2026-10-31", today), true);
  assert.equal(dateAllowed("2026-11-01", today), true); // tomorrow: clock skew
  assert.equal(dateAllowed("2026-11-02", today), false);
  assert.equal(dateAllowed("2026-10-01", today), true);
  assert.equal(dateAllowed("2024-10-01", today), true); // exactly 24 months back (first day of that month)
  assert.equal(dateAllowed("2024-09-30", today), false);
  assert.equal(dateAllowed("2026-02-30", today), false);
  assert.equal(dateAllowed("2026-13-01", today), false);
  assert.equal(dateAllowed("10/31/2026", today), false);
  assert.equal(dateAllowed("", today), false);
  assert.equal(dateAllowed("2026-12-31", "2026-12-31"), true);
  assert.equal(dateAllowed("2027-01-01", "2026-12-31"), true); // year rollover tomorrow
  assert.equal(dateAllowed("2027-01-02", "2026-12-31"), false);
  assert.equal(dateAllowed("2028-02-29", "2028-02-29"), true);
  assert.equal(dateAllowed("2027-02-29", "2027-02-28"), false);
  assert.equal(cleanDate("2026-10-15", today), "2026-10-15");
  rejects(() => cleanDate("2030-01-01", today), "far future");
  rejects(() => cleanDate(20261015, today), "number");
  rejects(() => cleanDate(undefined, today), "missing");
});

test("database rows become public manual transactions", () => {
  const row = { transaction_id: "t1", name: "Cafe", amount: 4.5, date: "2026-10-05T00:00:00+00:00", category_key: "food" };
  assert.deepEqual(toPublicManual(row), {
    id: "t1", name: "Cafe", amount: 4.5, date: "2026-10-05", category: "food", account: "Manual entry", institution: "Manual", manual: true,
  });
  // categories that no longer exist fall back to Other
  assert.equal(toPublicManual({ ...row, category_key: "c-deadbeef" }, new Set(["food", "other"])).category, "other");
  assert.equal(toPublicManual({ ...row, category_key: "food" }, new Set(["food", "other"])).category, "food");
  assert.equal(toPublicManual({ ...row, category_key: null }).category, "other");
  assert.equal(toPublicManual({ ...row, name: null, amount: null, date: null }).name, "Manual entry");
});
