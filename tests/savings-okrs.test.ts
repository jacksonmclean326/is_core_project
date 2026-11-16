import { test } from "node:test";
import assert from "node:assert/strict";
import { currentDailyStreak, usersWithFriends, evaluateMonth, finishedMonths, isCheckInDue, percent, userConsistency } from "../src/shared/savings-okrs.js";

const month = (spent: number, income: number | null, byCategory: Record<string, number> = {}) => ({
  spent,
  spentByCategory: byCategory,
  income,
  budget: null,
});

test("a savings goal is met when income minus spending reaches the target", () => {
  const goals = [{ kind: "Savings", target: 500, category: null }];
  assert.deepEqual(evaluateMonth(goals, month(1500, 2000)), { goalsCounted: 1, goalsMet: 1, met: true });
  assert.deepEqual(evaluateMonth(goals, month(1501, 2000)), { goalsCounted: 1, goalsMet: 0, met: false });
});

test("a savings goal without income or budget is skipped, not failed", () => {
  const goals = [{ kind: "Savings", target: 500, category: null }];
  assert.deepEqual(evaluateMonth(goals, month(100, null)), { goalsCounted: 0, goalsMet: 0, met: false });
  assert.equal(evaluateMonth(goals, { ...month(100, null), budget: 1000 }).met, true);
});

test("spending goals check the whole month or one category, and every goal must be met", () => {
  const goals = [
    { kind: "Spending", target: 300, category: "food" },
    { kind: "Spending", target: 1000, category: null },
  ];
  assert.equal(evaluateMonth(goals, month(900, null, { food: 300 })).met, true);
  assert.deepEqual(evaluateMonth(goals, month(900, null, { food: 301 })), { goalsCounted: 2, goalsMet: 1, met: false });
});

test("other goal kinds do not count toward the savings OKR", () => {
  assert.equal(evaluateMonth([{ kind: "Custom", target: 5, category: null }], month(0, 100)).goalsCounted, 0);
});

test("consistent means at least 3 of the last 4 finished months were met", () => {
  assert.deepEqual(finishedMonths("2026-11", 4), ["2026-10", "2026-09", "2026-08", "2026-07"]);
  const results = new Map([
    ["2026-10", true],
    ["2026-09", false],
    ["2026-08", true],
    ["2026-07", true],
    ["2026-11", false], // the current month is not finished and is ignored
  ]);
  assert.deepEqual(userConsistency(results, "2026-11"), { tracked: 4, met: 3, consistent: true });
  results.set("2026-07", false);
  assert.equal(userConsistency(results, "2026-11").consistent, false);
  assert.deepEqual(userConsistency(new Map([["2026-10", true]]), "2026-11"), { tracked: 1, met: 1, consistent: false });
});

test("the check-in is due 60 days after sign-up until answered, and Not now hides it", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  assert.equal(isCheckInDue("2026-09-20T12:00:00Z", null, now), false);
  assert.equal(isCheckInDue("2026-09-15T12:00:00Z", null, now), true);
  assert.equal(isCheckInDue("2026-09-15T12:00:00Z", { saved: false, snoozedUntil: null }, now), false);
  assert.equal(isCheckInDue("2026-09-15T12:00:00Z", { saved: null, snoozedUntil: "2026-11-20T00:00:00Z" }, now), false);
  assert.equal(isCheckInDue("2026-09-15T12:00:00Z", { saved: null, snoozedUntil: "2026-11-10T00:00:00Z" }, now), true);
});

test("percent returns null with nothing to divide by", () => {
  assert.equal(percent(0, 0), null);
  assert.equal(percent(2, 3), 67);
});


test("current streaks include today and yesterday but exclude expired and missing activity", () => {
  const now = new Date("2026-11-16T00:01:00Z");
  assert.equal(currentDailyStreak(7, "2026-11-16T00:00:00", now), 7);
  assert.equal(currentDailyStreak(8, "2026-11-15T00:00:00", now), 8);
  assert.equal(currentDailyStreak(6, "2026-11-16T00:00:00", now), 6);
  assert.equal(currentDailyStreak(20, "2026-11-14T23:59:00", now), 0);
  assert.equal(currentDailyStreak(7, "2026-11-17T00:00:00", now), 0);
  assert.equal(currentDailyStreak(7, null, now), 0);
  assert.equal(currentDailyStreak(null, "2026-11-16T00:00:00", now), 0);
  assert.equal(currentDailyStreak(7, "invalid", now), 0);
  const monthBoundary = new Date("2027-01-01T00:01:00Z");
  assert.equal(currentDailyStreak(7, "2026-12-31T00:00:00", monthBoundary), 7);
});


test("friend participation counts both users once and ignores self links and deleted accounts", () => {
  assert.equal(usersWithFriends(["a", "b", "c", "d"], [
    { user1_id: "a", user2_id: "b" },
    { user1_id: "c", user2_id: "a" },
    { user1_id: "b", user2_id: "a" },
    { user1_id: "d", user2_id: "d" },
    { user1_id: "d", user2_id: "deleted" },
  ]), 3);
  assert.equal(usersWithFriends(["a"], []), 0);
  assert.equal(usersWithFriends([], []), 0);
});
