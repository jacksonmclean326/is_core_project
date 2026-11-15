import type { IncomingMessage, ServerResponse } from "node:http";
import { requireSession } from "../auth/session.js";
import { createServiceSupabaseClient } from "../auth/supabase.js";
import { config } from "../config.js";
import { HttpError, supabaseFailure } from "../errors.js";
import { sendJson } from "../http/response.js";
import { isMissingTable, migrationMissing, recordGoalHistory, resultsTable } from "../savings-history.js";
import { monthStart, utcDateString } from "../../shared/months.js";
import { consistencyNeeded, consistencyWindow, finishedMonths, isSavingsOkrGoal, userConsistency } from "../../shared/savings-okrs.js";

/**
 * The signed-in user's own savings record for the Home page: whether they met their Savings and Spending goals in
 * each of the last 4 finished months (the same results OKR 3 uses), worked out fresh from their current data.
 */
export async function handleSavingsRecordApi(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
  if (pathname !== "/api/savings-record") return false;
  if (request.method !== "GET") throw new HttpError(405, "Method not allowed.");
  const { user } = await requireSession(request, response);
  if (!config.supabaseSecretKey) throw new HttpError(503, "The savings record needs SUPABASE_SECRET_KEY in the server settings.");
  const admin = createServiceSupabaseClient();

  const goals = await admin.from("Goal").select("goal_type").eq("user_id", user.id).returns<{ goal_type: string | null }[]>();
  if (goals.error) throw supabaseFailure(goals.error);
  const hasGoals = (goals.data ?? []).some((goal) => isSavingsOkrGoal(goal.goal_type ?? ""));

  await recordGoalHistory(admin, user.id, { recompute: true });
  const current = utcDateString().slice(0, 7);
  const window = finishedMonths(current, consistencyWindow); // newest first
  const rows = await admin
    .from(resultsTable)
    .select("month,met,goals_met,goals_counted")
    .eq("user_id", user.id)
    .gte("month", monthStart(window[window.length - 1]))
    .returns<{ month: string; met: boolean; goals_met: number; goals_counted: number }[]>();
  if (rows.error) {
    if (isMissingTable(rows.error, resultsTable)) throw migrationMissing();
    throw supabaseFailure(rows.error);
  }
  const byMonth = new Map((rows.data ?? []).map((row) => [row.month.slice(0, 7), row]));
  const consistency = userConsistency(new Map([...byMonth].map(([month, row]) => [month, row.met])), current);

  response.setHeader("Cache-Control", "no-store");
  sendJson(response, 200, {
    hasGoals,
    needed: consistencyNeeded,
    window: consistencyWindow,
    // Oldest first, for reading left to right.
    months: [...window].reverse().map((month) => {
      const row = byMonth.get(month);
      return { month, met: row ? row.met : null, goalsMet: row?.goals_met ?? 0, goalsCounted: row?.goals_counted ?? 0 };
    }),
    tracked: consistency.tracked,
    met: consistency.met,
    consistent: consistency.consistent,
  });
  return true;
}
