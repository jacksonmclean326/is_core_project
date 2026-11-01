import { getGoals, putGoals } from "./api.js";
import type { Goal } from "./core.js";

export type GoalRow = {
  goal_id: string;
  goal_type: string;
  goal_name: string | null;
  desired_savings: number | string;
  amount_savings: number | string | null;
};

function toGoal(row: GoalRow): Goal {
  return { id: row.goal_id, kind: row.goal_type, name: row.goal_name || `${row.goal_type} goal`,
    target: Number(row.desired_savings), progress: Number(row.amount_savings ?? 0) };
}

export async function loadGoals(): Promise<Goal[]> {
  const { goals } = await getGoals();
  return goals.map(toGoal);
}

export async function saveGoals(goals: Goal[]): Promise<Goal[]> {
  const result = await putGoals(goals.map(({ id, kind, name, target }) => ({ id, kind, name, target })));
  return result.goals.map(toGoal);
}
