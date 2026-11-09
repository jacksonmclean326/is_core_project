import type { IncomingMessage, ServerResponse } from "node:http";
import { requireSession } from "../auth/session.js";
import { createServiceSupabaseClient } from "../auth/supabase.js";
import { config } from "../config.js";
import { HttpError, supabaseFailure } from "../errors.js";
import { sendJson } from "../http/response.js";
import { selectGoals, withGoalProgress } from "./goals.js";
import { rankEntries, summarizeGoals, type LeaderboardEntry } from "../../shared/leaderboard.js";

export async function handleLeaderboardApi(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
  if (pathname !== "/api/leaderboard") return false;
  if (request.method !== "GET") throw new HttpError(405, "Method not allowed.");
  const { client, user } = await requireSession(request, response);
  if (!config.supabaseSecretKey) {
    throw new HttpError(503, "Leaderboard progress requires SUPABASE_SECRET_KEY in the server environment.");
  }
  // Member IDs come exclusively from this authenticated function, never request parameters.
  const members = await client.rpc("leaderboard_members");
  if (members.error) {
    if (members.error.code === "PGRST202") {
      throw new HttpError(503, "Apply the friend leaderboard database migration to enable rankings.");
    }
    throw supabaseFailure(members.error);
  }
  const admin = createServiceSupabaseClient();
  const entries: LeaderboardEntry[] = [];
  const authorized = members.data as { id: string; name: string }[];
  // Bound concurrency: goal progress loads current-month transactions and budget for each person.
  for (let offset = 0; offset < authorized.length; offset += 4) {
    const batch = await Promise.all(authorized.slice(offset, offset + 4).map(async (member) => {
      const goals = await selectGoals(admin, member.id);
      const progress = await withGoalProgress(member.id, goals);
      return { ...member, isYou: member.id === user.id, ...summarizeGoals(progress) };
    }));
    entries.push(...batch);
  }
  // Recheck authorization before returning if a friendship/visibility changed during the reads.
  const latest = await client.rpc("leaderboard_members");
  if (latest.error) throw supabaseFailure(latest.error);
  const allowed = new Set((latest.data as { id: string }[]).map((member) => member.id));
  response.setHeader("Cache-Control", "no-store");
  sendJson(response, 200, { entries: rankEntries(entries.filter((entry) => allowed.has(entry.id))), visible: allowed.has(user.id), updatedAt: new Date().toISOString() });
  return true;
}
