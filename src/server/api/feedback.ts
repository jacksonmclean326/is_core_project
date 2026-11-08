import type { IncomingMessage, ServerResponse } from "node:http";
import { requireSession } from "../auth/session.js";
import { HttpError, isRecord, supabaseFailure } from "../errors.js";
import { readJsonBody } from "../http/request-body.js";
import { sendJson } from "../http/response.js";

export const feedbackKinds = ["bug", "confusing", "idea", "praise"] as const;
export const feedbackMinLength = 5;
export const feedbackMaxLength = 1000;

const perHour = 10;
const hourMs = 60 * 60 * 1000;
const recentByUser = new Map<string, number[]>();

/** A person can send 10 messages an hour. Kept in memory, like sessions, so a restart resets it. */
function checkRate(userId: string): void {
  const now = Date.now();
  const recent = (recentByUser.get(userId) ?? []).filter((time) => now - time < hourMs);
  if (recent.length >= perHour) {
    throw new HttpError(429, "You have sent a lot of feedback in the last hour. Please try again a little later.");
  }
  recent.push(now);
  recentByUser.set(userId, recent);
}

function isMissingTable(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";
  return code === "42P01" || code === "PGRST205" || /Feedback/.test(message) && /(does not exist|schema cache)/i.test(message);
}

export async function handleFeedbackApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== "/api/feedback") return false;
  if (request.method !== "POST") throw new HttpError(405, "Method not allowed.");

  const { client, user } = await requireSession(request, response);
  const body = await readJsonBody(request);

  if (typeof body.kind !== "string" || !(feedbackKinds as readonly string[]).includes(body.kind)) {
    throw new HttpError(400, "Choose what kind of feedback this is.");
  }
  const message = typeof body.message === "string" ? body.message.replace(/\r\n/g, "\n").trim() : "";
  if (message.length < feedbackMinLength) {
    throw new HttpError(400, `Write a little more (at least ${feedbackMinLength} characters) so the team can act on it.`);
  }
  if (message.length > feedbackMaxLength) {
    throw new HttpError(400, `Feedback can be up to ${feedbackMaxLength} characters.`);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(message)) {
    throw new HttpError(400, "That message has characters we cannot save.");
  }
  const page = typeof body.page === "string" && /^\/[a-z]{0,20}$/.test(body.page) ? body.page : null;
  const contactOk = body.contactOk === true;
  const userAgent = String(request.headers["user-agent"] ?? "").slice(0, 200) || null;

  checkRate(user.id);

  const inserted = await client.from("Feedback").insert({
    user_id: user.id,
    kind: body.kind,
    message,
    page,
    contact_ok: contactOk,
    email: contactOk ? (user.email ?? null) : null,
    user_agent: userAgent,
  });
  if (inserted.error) {
    if (isMissingTable(inserted.error)) {
      throw new HttpError(503, "Feedback is not set up yet. Please email the team instead.");
    }
    throw supabaseFailure(inserted.error);
  }
  sendJson(response, 201, { ok: true });
  return true;
}
