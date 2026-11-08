import { getGoals, patchGoalSteps, putGoals } from "./api.js";
import type { Goal } from "./core.js";
import { goalKinds, type GoalStep } from "../shared/goal-progress.js";

export type GoalRow = {
  goal_id: string;
  goal_type: string;
  goal_name: string | null;
  desired_savings: number | string;
  amount_savings: number | string | null;
  category_key?: string | null;
  target_date?: string | null;
  steps?: GoalStep[] | null;
  /** Worked out by the server: from transactions for Savings/Spending goals, else the saved amount. */
  progress?: number;
  automatic?: boolean;
  note?: string | null;
};

function toGoal(row: GoalRow): Goal {
  return { id: row.goal_id, kind: row.goal_type, name: row.goal_name || `${row.goal_type} goal`,
    target: Number(row.desired_savings), progress: Number(row.progress ?? row.amount_savings ?? 0),
    automatic: row.automatic ?? false, note: row.note ?? null,
    category: row.category_key ?? null, deadline: row.target_date ? row.target_date.slice(0, 10) : null,
    steps: Array.isArray(row.steps) ? row.steps : null };
}

/** Stable order for display: by goal type, then name. (The database order is by random ID.) */
function sortedGoals(rows: GoalRow[]): Goal[] {
  const rank = (kind: string) => {
    const index = goalKinds.indexOf(kind as (typeof goalKinds)[number]);
    return index === -1 ? goalKinds.length : index;
  };
  return rows
    .map(toGoal)
    .sort((a, b) => rank(a.kind) - rank(b.kind) || a.name.localeCompare(b.name));
}

export async function loadGoals(): Promise<Goal[]> {
  const { goals } = await getGoals();
  return sortedGoals(goals);
}

/** Saves which steps of a checklist goal are done and returns the updated goal. */
export async function saveGoalSteps(id: string, steps: GoalStep[]): Promise<Goal> {
  const { goal } = await patchGoalSteps(id, steps);
  return toGoal(goal);
}

export async function saveGoals(goals: Goal[]): Promise<Goal[]> {
  const result = await putGoals(
    goals.map(({ id, kind, name, target, category, deadline, progress, steps }) => ({
      id, kind, name, target, category: category ?? null, deadline: deadline ?? null, progress,
      steps: kind === "Checklist" ? steps ?? [] : null,
    })),
  );
  return sortedGoals(result.goals);
}
