/**
 * Goal progress. Both the server and the browser can use this; it does no I/O.
 *
 * - Savings and Spending goals are automatic: they are measured for the current calendar month from
 *   data the app already has. A Spending goal can cover all spending or a single category.
 * - Earnings, Investing and Custom goals are manual: the user types how far along they are. They can
 *   have a deadline, which adds a "about $X a month" pace note.
 */

import { createMoneyFormatter, defaultCurrency } from "./currencies.js";
import { addDays, shortDateLabel } from "./months.js";

export const goalKinds = ["Savings", "Spending", "Earnings", "Investing", "Custom", "Checklist"] as const;

/** One step of a Checklist goal. */
export interface GoalStep {
  text: string;
  done: boolean;
}

export const maxChecklistSteps = 20;
export const maxStepLength = 80;

/** Reads steps from untrusted JSON. Returns null if it is not a valid list of 1 to 20 steps. */
export function parseSteps(value: unknown): GoalStep[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxChecklistSteps) return null;
  const steps: GoalStep[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const { text, done } = item as { text?: unknown; done?: unknown };
    if (typeof text !== "string" || typeof done !== "boolean") return null;
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean || clean.length > maxStepLength || /[<>]/.test(clean)) return null;
    steps.push({ text: clean, done });
  }
  return steps;
}
export type GoalKind = (typeof goalKinds)[number];

export interface MonthFacts {
  /** Today as YYYY-MM-DD (UTC). */
  today: string;
  /** The user's display currency code, for amounts written into notes. Defaults to USD. */
  currency?: string;
  /** Units of that currency per US dollar (amounts are stored in dollars). Defaults to 1. */
  rate?: number;
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

/** "About $X a month to finish by Mar 15", or a short status when that does not apply. */
function paceNote(goal: GoalInput, progress: number, facts: MonthFacts): string | null {
  const today = facts.today;
  const dollars = (value: number) =>
    createMoneyFormatter(facts.currency ?? defaultCurrency).format(Math.round(value * (facts.rate ?? 1)));
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
  if (goal.kind === "Checklist") {
    // Progress is the number of steps done out of the number of steps, so there is nothing to convert or pace.
    let note: string | null = null;
    if (goal.stored < goal.target && goal.deadline) {
      note =
        goal.deadline < facts.today
          ? `The deadline (${shortDateLabel(goal.deadline)}) has passed.`
          : `Due ${shortDateLabel(goal.deadline)}.`;
    }
    return { progress: goal.stored, automatic: false, note };
  }
  return { progress: goal.stored, automatic: false, note: paceNote(goal, goal.stored, facts) };
}

/** Wording for the amounts under a goal's progress bar. */
export function goalAmountLabels(kind: string, progress: number, target: number): { left: string; right: string; over: boolean } {
  if (kind === "Spending") {
    const over = progress > target;
    return { left: over ? "over your limit" : "spent this month", right: "limit", over };
  }
  return { left: "toward goal", right: "goal", over: false };
}
