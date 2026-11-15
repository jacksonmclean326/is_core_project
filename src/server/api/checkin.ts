import type { IncomingMessage, ServerResponse } from "node:http";
import { isAdminUser } from "../admin.js";
import { requireSession } from "../auth/session.js";
import { HttpError, supabaseFailure } from "../errors.js";
import { readJsonBody } from "../http/request-body.js";
import { sendJson } from "../http/response.js";
import { checkInTable, isMissingTable, migrationMissing } from "../savings-history.js";
import { checkInAfterDays, checkInSnoozeDays, daysSince, isCheckInDue } from "../../shared/savings-okrs.js";

/**
 * OKR 4: the savings check-in. 60 days after sign-up the app asks once, "Have you saved money since you started
 * using Money Man?". "Not now" hides it for 7 days. Team admins can answer at any time and clear
 * their answer, so the check-in can be shown in a demo.
 */

interface CheckInRow {
  saved: boolean | null;
  amount: number | null;
  answered_at: string | null;
  snoozed_until: string | null;
}

export async function handleCheckInApi(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
  if (pathname !== "/api/checkin") return false;
  if (!["GET", "POST", "DELETE"].includes(request.method ?? "")) throw new HttpError(405, "Method not allowed.");
  const { client, user } = await requireSession(request, response);
  const admin = await isAdminUser(user);
  const signedUpAt = user.created_at;
  const days = daysSince(signedUpAt);

  if (request.method === "GET") {
    const result = await client
      .from(checkInTable)
      .select("saved,amount,answered_at,snoozed_until")
      .eq("user_id", user.id)
      .maybeSingle<CheckInRow>();
    if (result.error) {
      // Before the migration is run, simply never show the check-in.
      if (isMissingTable(result.error, checkInTable)) {
        sendJson(response, 200, { due: false, available: false, isAdmin: admin });
        return true;
      }
      throw supabaseFailure(result.error);
    }
    const row = result.data;
    response.setHeader("Cache-Control", "no-store");
    sendJson(response, 200, {
      available: true,
      due: isCheckInDue(signedUpAt, row ? { saved: row.saved, snoozedUntil: row.snoozed_until } : null),
      answered: row?.saved === true || row?.saved === false,
      saved: row?.saved ?? null,
      amount: row?.amount ?? null,
      daysSinceSignUp: days,
      isAdmin: admin,
    });
    return true;
  }

  if (request.method === "DELETE") {
    if (!admin) throw new HttpError(403, "Only the Money Man team can clear a check-in answer.");
    const removed = await client.from(checkInTable).delete().eq("user_id", user.id);
    if (removed.error) {
      if (isMissingTable(removed.error, checkInTable)) throw migrationMissing();
      throw supabaseFailure(removed.error);
    }
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (days < checkInAfterDays && !admin) {
    throw new HttpError(400, `The savings check-in opens ${checkInAfterDays} days after you sign up.`);
  }
  const body = await readJsonBody(request);
  let row: Record<string, unknown>;
  if (body.later === true) {
    row = { user_id: user.id, snoozed_until: new Date(Date.now() + checkInSnoozeDays * 86_400_000).toISOString() };
  } else {
    if (typeof body.saved !== "boolean") throw new HttpError(400, "Choose Yes or No.");
    let amount: number | null = null;
    if (body.saved && body.amount !== undefined && body.amount !== null) {
      if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount < 0 || body.amount >= 1e9) {
        throw new HttpError(400, "Enter an amount of zero or more, or leave it blank.");
      }
      amount = Math.round(body.amount * 100) / 100;
    }
    row = { user_id: user.id, saved: body.saved, amount, answered_at: new Date().toISOString(), snoozed_until: null };
  }
  const saved = await client.from(checkInTable).upsert(row, { onConflict: "user_id" });
  if (saved.error) {
    if (isMissingTable(saved.error, checkInTable)) throw migrationMissing();
    throw supabaseFailure(saved.error);
  }
  sendJson(response, 200, { ok: true });
  return true;
}
