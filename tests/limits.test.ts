import assert from "node:assert/strict";
import { test } from "node:test";
import { limitStatus, maxLimit, parseLimit, scaleLimits, totalLimits } from "../src/shared/limits.ts";

const value = (text: string) => {
  const result = parseLimit(text);
  assert.ok(result.ok, `${JSON.stringify(text)} should be accepted`);
  return result.value;
};
const message = (text: string) => {
  const result = parseLimit(text);
  assert.equal(result.ok, false, `${JSON.stringify(text)} should be rejected`);
  return result.ok ? "" : result.message;
};

test("blank means no limit", () => {
  assert.equal(value(""), 0);
  assert.equal(value("   "), 0);
  assert.equal(value("$"), 0);
});

test("ordinary amounts are read the way people type them", () => {
  assert.equal(value("300"), 300);
  assert.equal(value(" 300 "), 300);
  assert.equal(value("$300"), 300);
  assert.equal(value("1,200"), 1200);
  assert.equal(value("$1,200.50"), 1200.5);
  assert.equal(value("75.5"), 75.5);
  assert.equal(value("75.50"), 75.5);
  assert.equal(value("0"), 0);
  assert.equal(value("0.00"), 0);
  assert.equal(value("007"), 7);
  assert.equal(value(String(maxLimit)), maxLimit);
});

test("negative, text, and malformed amounts are rejected with a helpful message", () => {
  assert.match(message("-5"), /negative/);
  assert.match(message("-0.01"), /negative/);
  for (const bad of ["abc", "12abc", "1.234", "1..2", ".", "1.", ".5", "5,5,5x", "1e3", "NaN", "Infinity", "1/2", "12 34 x"]) {
    assert.match(message(bad), /Enter a limit/, bad);
  }
  assert.match(message(String(maxLimit + 1)), /too large/);
  assert.match(message("99999999999"), /too large/);
});

test("status: none, within, close (90%), reached (100%)", () => {
  assert.equal(limitStatus(500, 0), "none");
  assert.equal(limitStatus(0, 0), "none");
  assert.equal(limitStatus(500, -5), "none");
  assert.equal(limitStatus(0, 300), "within");
  assert.equal(limitStatus(269, 300), "within");
  assert.equal(limitStatus(270, 300), "close");
  assert.equal(limitStatus(299, 300), "close");
  assert.equal(limitStatus(300, 300), "reached");
  assert.equal(limitStatus(900, 300), "reached");
  assert.equal(limitStatus(Number.NaN, 300), "within");
});

test("limits add up exactly", () => {
  assert.equal(totalLimits([]), 0);
  assert.equal(totalLimits([0, 0]), 0);
  assert.equal(totalLimits([900, 300, 0, 180]), 1380);
  assert.equal(totalLimits([0.1, 0.2]), 0.3);
  assert.equal(totalLimits([-5, 100]), 100, "negative values are ignored");
});

test("changing the budget scales set limits in proportion and leaves 'no limit' alone", () => {
  assert.deepEqual(scaleLimits([900, 300, 0, 100], 2000, 4000), [1800, 600, 0, 200]);
  assert.deepEqual(scaleLimits([900, 300, 0, 100], 2000, 1000), [450, 150, 0, 50]);
  assert.deepEqual(scaleLimits([1, 2], 100, 10), [1, 1], "a limit never scales down to zero (that would remove it)");
});

test("saving the same budget, or setting one for the first time, never touches limits", () => {
  const limits = [900, 300, 0];
  assert.equal(scaleLimits(limits, 2200, 2200), limits, "unchanged budget");
  assert.equal(scaleLimits(limits, 0, 2200), limits, "no previous budget");
  assert.equal(scaleLimits(limits, 2200, 0), limits, "budget cleared");
  assert.equal(scaleLimits(limits, Number.NaN, 2200), limits);
});
