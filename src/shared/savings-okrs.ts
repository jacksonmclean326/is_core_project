/**
 * Savings OKRs. Both the server and the browser can use this; it does no I/O.
 *
 * OKR 3: "% of users that consistently meet their savings goals". Each finished month, a user's Savings and
 * Spending goals are checked against that month's spending and income. The month counts as met when every
 * goal that could be checked was met. A user is "consistent" when they met their goals in at least 3 of their
 * last 4 finished months.
 *
 * OKR 4: "% of users that reported savings after two months of using the app". 60 days after sign-up the
 * app asks once whether they have saved money.
 */

import { addMonths, type MonthKey } from "./months.js";

/** Finished months looked at for "consistently". */
export const consistencyWindow = 4;
/** Months in that window that must be met. */
export const consistencyNeeded = 3;
/** Finished months worked out from saved transactions the first time a user is checked. */
export const backfillMonths = 12;
/** Days after sign-up before the savings check-in appears. */
export const checkInAfterDays = 60;
/** Days "Not now" hides the check-in. */
export const checkInSnoozeDays = 7;

export interface MonthGoal {
  kind: string;
  target: number;
  /** Spending goals only: a category key, or null for all spending. */
  category: string | null;
}

export interface MonthSpending {
  /** Total spent that month, in dollars. */
  spent: number;
  spentByCategory: Record<string, number>;
  /** Monthly income for that month, if known. */
  income: number | null;
  /** Monthly budget for that month, if known. */
  budget: number | null;
}

export interface MonthOutcome {
  goalsCounted: number;
  goalsMet: number;
  /** True when at least one goal was checked and every checked goal was met. */
  met: boolean;
}

export function isSavingsOkrGoal(kind: string): boolean {
  return kind === "Savings" || kind === "Spending";
}

/**
 * Whether a month's Savings and Spending goals were met. A Savings goal is met when income (or budget, if no
 * income is saved) minus spending reaches the target; without either it cannot be checked and is skipped.
 * A Spending goal is met when spending stayed at or under the limit.
 */
export function evaluateMonth(goals: MonthGoal[], month: MonthSpending): MonthOutcome {
  let goalsCounted = 0;
  let goalsMet = 0;
  for (const goal of goals) {
    if (!Number.isFinite(goal.target) || goal.target <= 0) continue;
    if (goal.kind === "Spending") {
      const spent = goal.category ? (month.spentByCategory[goal.category] ?? 0) : month.spent;
      goalsCounted++;
      if (spent <= goal.target + 0.005) goalsMet++;
    } else if (goal.kind === "Savings") {
      const base = month.income && month.income > 0 ? month.income : month.budget && month.budget > 0 ? month.budget : null;
      if (base === null) continue;
      goalsCounted++;
      if (base - month.spent >= goal.target - 0.005) goalsMet++;
    }
  }
  return { goalsCounted, goalsMet, met: goalsCounted > 0 && goalsMet === goalsCounted };
}

/** The finished months before `currentMonth`, newest first. */
export function finishedMonths(currentMonth: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, index) => addMonths(currentMonth, -(index + 1)));
}

export interface UserConsistency {
  /** Finished months in the window that have a result. */
  tracked: number;
  /** Of those, months that were met. */
  met: number;
  consistent: boolean;
}

/** How a user did over their last 4 finished months. `results` maps "YYYY-MM" to whether it was met. */
export function userConsistency(results: Map<MonthKey, boolean>, currentMonth: MonthKey): UserConsistency {
  let tracked = 0;
  let met = 0;
  for (const month of finishedMonths(currentMonth, consistencyWindow)) {
    if (!results.has(month)) continue;
    tracked++;
    if (results.get(month)) met++;
  }
  return { tracked, met, consistent: met >= consistencyNeeded };
}

/** Whole days since an ISO timestamp. */
export function daysSince(iso: string, now: Date = new Date()): number {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 0;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

export interface CheckInRecord {
  saved: boolean | null;
  snoozedUntil: string | null;
}

/** Whether the savings check-in should appear now. */
export function isCheckInDue(signedUpAt: string, record: CheckInRecord | null, now: Date = new Date()): boolean {
  if (daysSince(signedUpAt, now) < checkInAfterDays) return false;
  if (record?.saved === true || record?.saved === false) return false;
  if (record?.snoozedUntil && Date.parse(record.snoozedUntil) > now.getTime()) return false;
  return true;
}

/** A share as a whole percent, or null when there is nothing to divide by. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** Current UTC daily streak: yesterday remains active until today ends. */
export function currentDailyStreak(streak: number | null, lastActive: string | null, now: Date = new Date()): number {
  if (!lastActive || streak === null || !Number.isSafeInteger(streak) || streak < 1) return 0;
  // User.last_active is a UTC timestamp without a timezone in Postgres.
  const date = lastActive.slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  return date === today || date === yesterday ? streak : 0;
}

/** Each registered user counts once, on either side of a mutual friendship. */
export function usersWithFriends(userIds: string[], friendships: { user1_id: string; user2_id: string }[]): number {
  const registered = new Set(userIds);
  const connected = new Set<string>();
  for (const { user1_id, user2_id } of friendships) {
    if (user1_id === user2_id || !registered.has(user1_id) || !registered.has(user2_id)) continue;
    connected.add(user1_id);
    connected.add(user2_id);
  }
  return connected.size;
}
