import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeGoals, rankEntries, type LeaderboardEntry } from "../src/shared/leaderboard.js";

const goal = (kind: string, target: number, progress: number) => ({ goal_type: kind, desired_savings: target, progress });

test("completion weights goals equally, caps overachievement, and counts reached goals", () => {
  assert.deepEqual(summarizeGoals([goal("Savings", 10000, 5000), goal("Checklist", 2, 4)]), {
    score: 750, goalCount: 2, completed: 1, spendingCount: 0, withinLimit: 0,
  });
});
test("spending does not earn completion points and exceeding a limit is not success", () => {
  assert.deepEqual(summarizeGoals([goal("Spending", 100, 100), goal("Spending", 100, 101)]), {
    score: null, goalCount: 0, completed: 0, spendingCount: 2, withinLimit: 1,
  });
});
test("empty and corrupt goals cannot produce a misleading score", () => {
  assert.equal(summarizeGoals([]).score, null);
  assert.equal(summarizeGoals([goal("Custom", 0, 1), goal("Custom", Infinity, 1), goal("Custom", 100, NaN)]).score, null);
  assert.equal(summarizeGoals([goal("Custom", 100, -5)]).score, 0);
});
test("ranking places unranked people last and resolves ties deterministically", () => {
  const entry = (id: string, name: string, score: number | null): LeaderboardEntry => ({ id, name, score, isYou: false, goalCount: 1, completed: 0, spendingCount: 0, withinLimit: 0 });
  const entries = [entry("a", "Zoe", null), entry("b", "Zoe", 50), entry("c", "Amy", 50), entry("d", "Ben", 0)];
  assert.deepEqual(rankEntries(entries).map((person) => person.id), ["c", "b", "d", "a"]);
  assert.equal(entries[0].id, "a");
});

test("simple points examples and full completion stay within 0–1000", () => {
  assert.equal(summarizeGoals([goal("Custom", 100, 50)]).score, 500);
  assert.equal(summarizeGoals([goal("Custom", 100, 25), goal("Checklist", 2, 1)]).score, 375);
  assert.equal(summarizeGoals([goal("Investing", 100, 1000)]).score, 1000);
  assert.equal(summarizeGoals([goal("Custom", 100, 0)]).score, 0);
});
