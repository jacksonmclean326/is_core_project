import type { IncomingMessage, ServerResponse } from "node:http";
import { addMonths, monthStart } from "../../shared/months.js";
import {
  currentMonthlyChallenge,
  rankChallengeEntries,
  scoreMonthlyChallenge,
  type ChallengeTransaction,
  type RankedLeaderboardEntry,
} from "../../shared/leaderboard.js";
import { hiddenSourceIds, withoutHidden } from "../accounts/hidden-sources.js";
import { requireSession } from "../auth/session.js";
import { createServiceSupabaseClient } from "../auth/supabase.js";
import { config } from "../config.js";
import { HttpError, supabaseFailure } from "../errors.js";
import { sendJson } from "../http/response.js";
import { budgetForMonth } from "./budget.js";

const pageSize = 1000;

async function loadChallengeTransactions(
  admin: ReturnType<typeof createServiceSupabaseClient>,
  userId: string,
  month: string,
): Promise<ChallengeTransaction[]> {
  const from = `${monthStart(month)}T00:00:00.000Z`;
  const to = `${monthStart(addMonths(month, 1))}T00:00:00.000Z`;
  const hidden = await hiddenSourceIds(admin, userId);
  const transactions: ChallengeTransaction[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const result = await withoutHidden(
      admin
        .from("Transaction")
        .select("transaction_id,amount,date,category_key,name")
        .eq("user_id", userId)
        .gte("date", from)
        .lt("date", to),
      hidden,
    )
      .order("date", { ascending: true })
      .order("transaction_id", { ascending: true })
      .range(offset, offset + pageSize - 1)
      .returns<{
        transaction_id: string;
        amount: number | null;
        date: string | null;
        category_key: string | null;
        name: string | null;
      }[]>();
    if (result.error) throw supabaseFailure(result.error);
    const rows = result.data ?? [];
    transactions.push(...rows.map((row) => ({
      id: row.transaction_id,
      amount: row.amount,
      date: row.date,
      category: row.category_key,
      name: row.name,
    })));
    if (rows.length < pageSize) break;
  }

  return transactions;
}

export async function handleLeaderboardApi(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
  if (pathname !== "/api/leaderboard") return false;
  if (request.method !== "GET") throw new HttpError(405, "Method not allowed.");
  const { client, user } = await requireSession(request, response);
  if (!config.supabaseSecretKey) {
    throw new HttpError(503, "Leaderboard progress requires SUPABASE_SECRET_KEY in the server environment.");
  }

  // The RPC only returns the caller and visible direct friends; client parameters never select members.
  const members = await client.rpc("leaderboard_members");
  if (members.error) {
    if (members.error.code === "PGRST202") {
      throw new HttpError(503, "Apply the friend leaderboard database migration to enable rankings.");
    }
    throw supabaseFailure(members.error);
  }

  const challenge = currentMonthlyChallenge();
  const admin = createServiceSupabaseClient();
  const authorized = (members.data ?? []) as { id: string; name: string }[];
  const ranked: RankedLeaderboardEntry[] = [];
  for (let offset = 0; offset < authorized.length; offset += 4) {
    const batch = await Promise.all(authorized.slice(offset, offset + 4).map(async (member) => {
      const [transactions, budget] = await Promise.all([
        loadChallengeTransactions(admin, member.id, challenge.month),
        budgetForMonth(admin, member.id, `${challenge.month}-01`),
      ]);
      const result = scoreMonthlyChallenge(
        challenge,
        transactions,
        budget.row?.monthly_income ?? null,
        budget.row?.monthly_budget ?? null,
      );
      return {
        id: member.id,
        name: member.name,
        isYou: member.id === user.id,
        score: result.score,
        status: result.status,
        completedAt: result.completedAt,
      };
    }));
    ranked.push(...batch);
  }

  // Recheck friendship and visibility before returning scores read from the service role.
  const latest = await client.rpc("leaderboard_members");
  if (latest.error) throw supabaseFailure(latest.error);
  const allowed = new Set(((latest.data ?? []) as { id: string }[]).map((member) => member.id));
  const entries = rankChallengeEntries(
    ranked.filter((entry) => allowed.has(entry.id)),
    challenge.id,
  ).map(({ completedAt: _completedAt, ...entry }) => ({
    ...entry,
    score: Math.round(entry.score * 100) / 100,
  }));

  response.setHeader("Cache-Control", "no-store");
  sendJson(response, 200, {
    challenge,
    entries,
    visible: allowed.has(user.id),
    updatedAt: new Date().toISOString(),
  });
  return true;
}
