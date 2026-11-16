import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentMonthlyChallenge,
  rankChallengeEntries,
  scoreMonthlyChallenge,
  type ChallengeTransaction,
  type RankedLeaderboardEntry,
} from "../src/shared/leaderboard.js";

const transaction = (
  id: string,
  amount: number,
  date: string,
  category = "other",
  name = "Purchase",
): ChallengeTransaction => ({ id, amount, date, category, name });
const roundedPercent = (score: number) => Math.round(score * 100) / 100;

test("monthly challenges rotate predictably and report calendar days remaining", () => {
  assert.equal(currentMonthlyChallenge(new Date("2026-01-15T12:00:00Z")).id, "micro-savings");
  assert.equal(currentMonthlyChallenge(new Date("2026-02-28T12:00:00Z")).id, "eating-out");
  assert.equal(currentMonthlyChallenge(new Date("2026-02-28T12:00:00Z")).daysRemaining, 1);
  assert.equal(currentMonthlyChallenge(new Date("2026-03-01T00:00:00Z")).id, "round-up");
  assert.equal(currentMonthlyChallenge(new Date("2027-01-01T00:00:00Z")).id, "micro-savings");
});

test("micro-savings starts at zero without transactions and scores monthly net savings", () => {
  const challenge = currentMonthlyChallenge(new Date("2026-01-15T12:00:00Z"));
  assert.deepEqual(scoreMonthlyChallenge(challenge, [], 1000, null), {
    score: 0, status: "in-progress", completedAt: null,
  });
  assert.deepEqual(scoreMonthlyChallenge(challenge, [
    transaction("one", 100, "2026-01-05"),
    transaction("two", 50, "2026-01-10"),
  ], 400, null), {
    score: 100, status: "completed", completedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(scoreMonthlyChallenge(challenge, [transaction("one", 100, "2026-01-05")], 300, null).score, 80);
});

test("eating-out challenge starts at full health and excludes identified grocery merchants", () => {
  const challenge = currentMonthlyChallenge(new Date("2026-02-15T12:00:00Z"));
  assert.equal(scoreMonthlyChallenge(challenge, [], null, null).score, 100);
  const result = scoreMonthlyChallenge(challenge, [
    transaction("restaurant", 100, "2026-02-05", "food", "Cafe Example"),
    transaction("groceries", 120, "2026-02-06", "food", "Whole Foods Market"),
  ], null, null);
  assert.equal(roundedPercent(result.score), 33.33);
  assert.equal(result.status, "on-track");
  assert.equal(scoreMonthlyChallenge(challenge, [transaction("over", 150, "2026-02-05", "food")], null, null).score, 0);
});

test("round-ups use stored precision, count exact-dollar purchases as zero, and record the first hit date", () => {
  const challenge = currentMonthlyChallenge(new Date("2026-03-15T12:00:00Z"));
  assert.equal(scoreMonthlyChallenge(challenge, [
    transaction("fractional", 5.25, "2026-03-01"),
    transaction("exact", 5, "2026-03-02"),
  ], null, null).score, 0.75 / 35 * 100);
  assert.equal(roundedPercent(scoreMonthlyChallenge(challenge, Array.from({ length: 100 }, (_, index) =>
    transaction(String(index), 5.999, "2026-03-03"),
  ), null, null).score), 0.29);

  const result = scoreMonthlyChallenge(challenge, Array.from({ length: 70 }, (_, index) =>
    transaction(String(index).padStart(3, "0"), 1.5, index < 69 ? "2026-03-01" : "2026-03-02"),
  ), null, null);
  assert.equal(result.score, 100);
  assert.equal(result.status, "completed");
  assert.equal(result.completedAt, "2026-03-02T00:00:00.000Z");
});

test("round-up and savings finishers rank by completion time before progress", () => {
  const entry = (
    id: string,
    score: number,
    status: RankedLeaderboardEntry["status"],
    completedAt: string | null,
  ): RankedLeaderboardEntry => ({ id, name: id, isYou: false, score, status, completedAt });
  const entries = [
    entry("in-progress-high", 90, "in-progress", null),
    entry("late", 100, "completed", "2026-03-10T00:00:00.000Z"),
    entry("early", 100, "completed", "2026-03-05T00:00:00.000Z"),
    entry("in-progress-low", 40, "in-progress", null),
  ];
  assert.deepEqual(rankChallengeEntries(entries, "round-up").map((person) => person.id), [
    "early", "late", "in-progress-high", "in-progress-low",
  ]);
});

test("eating-out entries rank solely by remaining health", () => {
  const entries: RankedLeaderboardEntry[] = [
    { id: "lower", name: "Lower", isYou: false, score: 45, status: "on-track", completedAt: null },
    { id: "higher", name: "Higher", isYou: false, score: 80, status: "on-track", completedAt: null },
  ];
  assert.deepEqual(rankChallengeEntries(entries, "eating-out").map((person) => person.id), ["higher", "lower"]);
});
