import type { SessionClient } from "./auth/supabase.js";
import { HttpError, isRecord, supabaseFailure } from "./errors.js";
import { hiddenSourceIds, withoutHidden } from "./hidden-accounts.js";
import { isMonthKey, monthStart, utcDateString, type MonthKey } from "../shared/months.js";
import {
  backfillMonths,
  evaluateMonth,
  finishedMonths,
  isSavingsOkrGoal,
  type MonthGoal,
  type MonthSpending,
} from "../shared/savings-okrs.js";

/**
 * Monthly goal results for OKR 3. Each finished month gets one "Goal Month Result" row per user. The first time
 * a user is checked, up to 12 past months are worked out from saved transactions and income; after that each
 * month is recorded once it ends. Opening the team's /admin page works every month out again from current data,
 * so the Key Result always follows what users have actually done.
 */

const pageSize = 1000;
export const resultsTable = "Goal Month Result";
export const checkInTable = "Savings Check-in";

export function isMissingTable(error: unknown, table: string): boolean {
  if (!isRecord(error)) return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";
  return code === "42P01" || code === "PGRST205" || (message.includes(table) && /(does not exist|schema cache)/i.test(message));
}

export const migrationMissing = () =>
  new HttpError(503, "Run supabase/migrations/20261114_savings_okrs.sql in the Supabase SQL Editor to turn on the savings OKRs.");

interface BudgetRow {
  month: string | null;
  monthly_income: number | null;
  monthly_budget: number | null;
}

/** That month's budget row, else the latest earlier one, else the earliest later one (income is usually set once). */
function budgetFor(month: MonthKey, rows: BudgetRow[]): BudgetRow | null {
  const dated = rows.filter((row) => row.month && isMonthKey(row.month.slice(0, 7)));
  const key = (row: BudgetRow) => (row.month ?? "").slice(0, 7);
  const exact = dated.find((row) => key(row) === month);
  if (exact) return exact;
  const earlier = dated.filter((row) => key(row) < month).sort((a, b) => key(b).localeCompare(key(a)))[0];
  if (earlier) return earlier;
  return dated.filter((row) => key(row) > month).sort((a, b) => key(a).localeCompare(key(b)))[0] ?? null;
}

/** Spending per month (and per category) between two months, leaving out hidden accounts like the rest of the app. */
async function spendingByMonth(admin: SessionClient, userId: string, from: MonthKey, toExclusive: MonthKey) {
  const months = new Map<MonthKey, { cents: number; byCategory: Map<string, number> }>();
  const hidden = await hiddenSourceIds(admin, userId);
  for (let offset = 0; ; offset += pageSize) {
    const result = await withoutHidden(
      admin
        .from("Transaction")
        .select("amount,category_key,date")
        .eq("user_id", userId)
        .gte("date", `${monthStart(from)}T00:00:00Z`)
        .lt("date", `${monthStart(toExclusive)}T00:00:00Z`),
      hidden,
    )
      .order("transaction_id", { ascending: true })
      .range(offset, offset + pageSize - 1)
      .returns<{ amount: number | null; category_key: string | null; date: string | null }[]>();
    if (result.error) throw supabaseFailure(result.error);
    const rows = result.data ?? [];
    for (const row of rows) {
      if (typeof row.amount !== "number" || !Number.isFinite(row.amount) || !row.date) continue;
      const month = row.date.slice(0, 7);
      if (!isMonthKey(month)) continue;
      const entry = months.get(month) ?? { cents: 0, byCategory: new Map<string, number>() };
      const cents = Math.round(row.amount * 100);
      entry.cents += cents;
      const category = row.category_key || "other";
      entry.byCategory.set(category, (entry.byCategory.get(category) ?? 0) + cents);
      months.set(month, entry);
    }
    if (rows.length < pageSize) break;
  }
  return months;
}

async function savingsGoals(admin: SessionClient, userId: string): Promise<MonthGoal[]> {
  const result = await admin
    .from("Goal")
    .select("goal_type,desired_savings,category_key")
    .eq("user_id", userId)
    .returns<{ goal_type: string | null; desired_savings: number | string | null; category_key: string | null }[]>();
  if (result.error) throw supabaseFailure(result.error);
  return (result.data ?? [])
    .filter((row) => isSavingsOkrGoal(row.goal_type ?? ""))
    .map((row) => ({
      kind: row.goal_type ?? "",
      target: Number(row.desired_savings ?? 0),
      category: row.goal_type === "Spending" ? row.category_key : null,
    }));
}

/**
 * Records finished months that have no result yet (or every month in the window when `recompute` is true).
 * A month is only recorded when the user had transactions that month, so empty history is not counted as a
 * success or a miss. Returns how many months were written.
 */
export async function recordGoalHistory(
  admin: SessionClient,
  userId: string,
  options: { recompute?: boolean; now?: Date } = {},
): Promise<number> {
  const goals = await savingsGoals(admin, userId);
  const current = utcDateString(options.now).slice(0, 7);
  const window = finishedMonths(current, backfillMonths);

  // When recalculating, start from a clean slate for this user's window, so a month that no longer counts
  // (goals deleted, transactions removed) does not keep an old result.
  const clearWindow = async () => {
    if (!options.recompute) return;
    const removed = await admin.from(resultsTable).delete().eq("user_id", userId).gte("month", monthStart(window[window.length - 1]));
    if (removed.error) {
      if (isMissingTable(removed.error, resultsTable)) throw migrationMissing();
      throw supabaseFailure(removed.error);
    }
  };
  if (!goals.length) {
    await clearWindow();
    return 0;
  }
  let wanted = window;
  if (!options.recompute) {
    const existing = await admin.from(resultsTable).select("month").eq("user_id", userId).gte("month", monthStart(window[window.length - 1]));
    if (existing.error) {
      if (isMissingTable(existing.error, resultsTable)) throw migrationMissing();
      throw supabaseFailure(existing.error);
    }
    const done = new Set((existing.data ?? []).map((row) => String((row as { month: string }).month).slice(0, 7)));
    wanted = window.filter((month) => !done.has(month));
  }
  if (!wanted.length) return 0;

  const oldest = wanted[wanted.length - 1];
  const [spending, budgets] = await Promise.all([
    spendingByMonth(admin, userId, oldest, current),
    admin.from("Budget").select("month,monthly_income,monthly_budget").eq("user_id", userId).returns<BudgetRow[]>(),
  ]);
  if (budgets.error) throw supabaseFailure(budgets.error);

  const rows = [];
  for (const month of wanted) {
    const spent = spending.get(month);
    if (!spent) continue;
    const budget = budgetFor(month, budgets.data ?? []);
    const facts: MonthSpending = {
      spent: spent.cents / 100,
      spentByCategory: Object.fromEntries([...spent.byCategory].map(([key, cents]) => [key, cents / 100])),
      income: budget?.monthly_income ?? null,
      budget: budget?.monthly_budget ?? null,
    };
    const outcome = evaluateMonth(goals, facts);
    if (!outcome.goalsCounted) continue;
    rows.push({
      user_id: userId,
      month: monthStart(month),
      goals_counted: outcome.goalsCounted,
      goals_met: outcome.goalsMet,
      met: outcome.met,
      spent: facts.spent,
      income: facts.income ?? facts.budget,
      computed_at: new Date().toISOString(),
    });
  }
  await clearWindow();
  if (!rows.length) return 0;
  const saved = await admin.from(resultsTable).upsert(rows, { onConflict: "user_id,month" });
  if (saved.error) {
    if (isMissingTable(saved.error, resultsTable)) throw migrationMissing();
    throw supabaseFailure(saved.error);
  }
  return rows.length;
}

const recordedOn = new Map<string, string>();

/**
 * Records last month's result (and backfills) at most once a day per user, without slowing the request down.
 * Called when someone opens their goals.
 */
export function recordGoalHistoryInBackground(admin: SessionClient, userId: string): void {
  const today = utcDateString();
  if (recordedOn.get(userId) === today) return;
  recordedOn.set(userId, today);
  recordGoalHistory(admin, userId).catch((error: unknown) => {
    // Until the migration is run, try again tomorrow instead of on every request.
    if (error instanceof HttpError && error.status === 503) return;
    recordedOn.delete(userId);
    console.error("Recording monthly goal results failed.", error);
  });
}
