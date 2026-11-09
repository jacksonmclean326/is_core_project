export interface LeaderboardEntry {
  id: string;
  name: string;
  isYou: boolean;
  score: number | null;
  goalCount: number;
  completed: number;
  spendingCount: number;
  withinLimit: number;
}

interface RankedGoal {
  goal_type: string | null;
  desired_savings: number | string | null;
  progress: number;
}

export const maxLeaderboardScore = 1000;
export const leaderboardVisibilityEvent = "money-man-leaderboard-visibility";

/** Equal weight per goal; spending limits are reported separately from completion. */
export function summarizeGoals(goals: RankedGoal[]) {
  let total = 0;
  let goalCount = 0;
  let completed = 0;
  let spendingCount = 0;
  let withinLimit = 0;
  for (const goal of goals) {
    const target = Number(goal.desired_savings);
    if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(goal.progress)) continue;
    if (goal.goal_type === "Spending") {
      spendingCount++;
      if (goal.progress <= target) withinLimit++;
      continue;
    }
    if (!["Savings", "Earnings", "Investing", "Custom", "Checklist"].includes(goal.goal_type ?? "")) continue;
    goalCount++;
    total += Math.min(1, Math.max(0, goal.progress / target));
    if (goal.progress >= target) completed++;
  }
  return { score: goalCount ? Math.round(total / goalCount * maxLeaderboardScore) : null, goalCount, completed, spendingCount, withinLimit };
}

export function rankEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
