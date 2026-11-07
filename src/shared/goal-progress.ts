/**
 * Goal progress. Both the server and the browser can use this; it does no I/O.
 *
 * - Savings and Spending goals are automatic: they are measured for the current calendar month from
 *   data the app already has. A Spending goal can cover all spending or a single category.
 * - Earnings, Investing and Custom goals are manual: the user types how far along they are. They can
 *   have a deadline, which adds a "about $X a month" pace note.
 */

import { addDays, shortDateLabel } from "./months.js";

export const goalKinds = ["Savings", "Spending", "Earnings", "Investing", "Custom"] as const;
export type GoalKind = (typeof goalKinds)[number];

export interface MonthFacts {
  /** Today as YYYY-MM-DD (UTC). */
  today: string;
  /** Total spending so far this month, in dollars. */
  spent: number;
  /** Spending so far this month for each category key, in dollars. */
  spentByCategory: Record<string, number>;
  /** Monthly income saved in the user's budget for this month, if any. */
  income: number | null;
  /** Monthly budget saved for this month, if any. */
  budget: number | null;
}

export interface GoalInput {
  kind: string;
  /** The saved progress, used by manual goals. */
  stored: number;
  target: number;
  /** Spending goals only: a category key, or null for all spending. */
  category: string | null;
  /** Manual goals only: YYYY-MM-DD, or null. */
  deadline: string | null;
}

export interface GoalProgress {
  progress: number;
  /** True when the number was worked out from transactions instead of typed in. */
  automatic: boolean;
  /** A short explanation to show under the goal, or null. */
  note: string | null;
}

export function isGoalKind(value: unknown): value is GoalKind {
  return typeof value === "string" && (goalKinds as readonly string[]).includes(value);
}

export function isAutomaticKind(kind: string): boolean {
  return kind === "Savings" || kind === "Spending";
}

const cents = (dollars: number) => Math.round(dollars * 100) / 100;
const dollars = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

/** "About $X a month to finish by Mar 15", or a short status when that does not apply. */
function paceNote(goal: GoalInput, progress: number, today: string): string | null {
  if (progress >= goal.target) return "Goal reached.";
  if (!goal.deadline) return null;
  if (goal.deadline < today) return `The deadline (${shortDateLabel(goal.deadline)}) has passed.`;
  let days = 0;
  for (let date = today; date < goal.deadline && days < 3660; date = addDays(date, 1)) days++;
  const monthsLeft = Math.max(1, Math.ceil(days / 30.4));
  const perMonth = Math.ceil((goal.target - progress) / monthsLeft);
  return `About ${dollars(perMonth)} a month to finish by ${shortDateLabel(goal.deadline)}.`;
}

export function computeGoalProgress(goal: GoalInput, facts: MonthFacts): GoalProgress {
  if (goal.kind === "Spending") {
    const spent = goal.category ? (facts.spentByCategory[goal.category] ?? 0) : facts.spent;
    return {
      progress: cents(spent),
      automatic: true,
      note: goal.category ? "Spent this month in this category. Stay under your limit." : "Spent this month. Stay under your limit.",
    };
  }
  if (goal.kind === "Savings") {
    const base = facts.income && facts.income > 0 ? facts.income : facts.budget && facts.budget > 0 ? facts.budget : null;
    if (base === null) {
      return { progress: 0, automatic: true, note: "Add your monthly income in Settings to track this automatically." };
    }
    return {
      progress: Math.max(0, cents(base - facts.spent)),
      automatic: true,
      note: "Saved so far this month: monthly income minus spending.",
    };
  }
  return { progress: goal.stored, automatic: false, note: paceNote(goal, goal.stored, facts.today) };
}

/** Wording for the amounts under a goal's progress bar. */
export function goalAmountLabels(kind: string, progress: number, target: number): { left: string; right: string; over: boolean } {
  if (kind === "Spending") {
    const over = progress > target;
    return { left: over ? "over your limit" : "spent this month", right: "limit", over };
  }
  return { left: "toward goal", right: "goal", over: false };
}
