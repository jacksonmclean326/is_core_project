import type { IncomingMessage, ServerResponse } from "node:http";
import {
  publicUser,
  rememberVerifiedUser,
  requireSession,
} from "../auth/session.js";
import { HttpError, supabaseFailure } from "../errors.js";
import { readJsonBody, requiredString } from "../http/request-body.js";
import { sendJson } from "../http/response.js";
import { currencyOrDefault, isCurrencyCode } from "../../shared/currencies.js";
import { rateFor } from "../rates.js";

export async function handleAccountApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === "/api/account" && request.method === "GET") {
    const { client, user } = await requireSession(request, response);
    const profile = await client
      .from("User")
      .select(
        "first_name,last_name,email_address,daily_sync,budget_reminders,leaderboard_visibility,streak",
      )
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile.error) throw supabaseFailure(profile.error);
    sendJson(response, 200, {
      ...publicUser(user),
      first_name: profile.data?.first_name ?? null,
      last_name: profile.data?.last_name ?? null,
      email_address: profile.data?.email_address ?? null,
      daily_sync: profile.data?.daily_sync !== false,
      budget_reminders: profile.data?.budget_reminders !== false,
      leaderboard_visibility: profile.data?.leaderboard_visibility !== false,
      streak: profile.data && Number.isFinite(profile.data.streak)
        ? Math.max(0, Math.trunc(profile.data.streak))
        : 1,
    });
    return true;
  }

  // The display currency is saved in the account's metadata, which every page already receives
  // with the session. It only changes the symbol and format of amounts; nothing is converted.
  if (pathname === "/api/account/currency" && request.method === "PATCH") {
    const { client, user, sessionId } = await requireSession(request, response);
    const body = await readJsonBody(request);
    if (!isCurrencyCode(body.currency)) {
      throw new HttpError(400, "Choose a currency from the list.");
    }
    if ((await rateFor(body.currency)) === null) {
      throw new HttpError(503, "Exchange rates are unavailable right now, so the currency was not changed. Please try again in a moment.");
    }
    const update = await client.auth.updateUser({
      data: { ...(user.user_metadata ?? {}), currency: body.currency },
    });
    if (update.error) throw supabaseFailure(update.error, 400);
    rememberVerifiedUser(sessionId, update.data.user);
    sendJson(response, 200, { currency: body.currency });
    return true;
  }

  if (pathname === "/api/account/preferences" && request.method === "PATCH") {
    const { client, user } = await requireSession(request, response);
    const body = await readJsonBody(request);
    const preference = body.preference;
    const columns = {
      daily_sync: "daily_sync",
      budget_reminders: "budget_reminders",
      leaderboard_visibility: "leaderboard_visibility",
    } as const;
    if (
      typeof preference !== "string" ||
      !Object.hasOwn(columns, preference) ||
      typeof body.enabled !== "boolean"
    ) {
      throw new HttpError(400, "Choose a valid preference and enabled value.");
    }
    const column = columns[preference as keyof typeof columns];
    const result = await client
      .from("User")
      .update({ [column]: body.enabled })
      .eq("user_id", user.id)
      .select("daily_sync,budget_reminders,leaderboard_visibility")
      .single();
    if (result.error) throw supabaseFailure(result.error);
    sendJson(response, 200, {
      daily_sync: result.data.daily_sync !== false,
      budget_reminders: result.data.budget_reminders !== false,
      leaderboard_visibility: result.data.leaderboard_visibility !== false,
    });
    return true;
  }

  if (pathname === "/api/account" && request.method === "PATCH") {
    const { client, user, sessionId } = await requireSession(request, response);
    const body = await readJsonBody(request);
    const firstName = requiredString(body.firstName, "First name", 100);
    const lastName = requiredString(body.lastName, "Last name", 100);
    const email = requiredString(body.email, "Email", 320).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, "Enter a valid email address.");
    }
    const emailChanged = email !== (user.email ?? "").toLowerCase();
    const password = body.password;
    if (
      password !== undefined &&
      password !== "" &&
      (typeof password !== "string" || password.length > 1024)
    ) {
      throw new HttpError(400, "Password must be 1024 characters or fewer.");
    }

    const authUpdate = await client.auth.updateUser({
      ...(emailChanged ? { email } : {}),
      ...(typeof password === "string" && password
        ? { password }
        : {}),
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`,
      },
    });
    if (authUpdate.error) throw supabaseFailure(authUpdate.error, 400);
    rememberVerifiedUser(sessionId, authUpdate.data.user);

    const profile = await client
      .from("User")
      .update({
        first_name: firstName,
        last_name: lastName,
        email_address: email,
      })
      .eq("user_id", user.id)
      .select("first_name,last_name,email_address")
      .single();
    if (profile.error) throw supabaseFailure(profile.error);

    sendJson(response, 200, {
      ...publicUser(authUpdate.data.user),
      first_name: profile.data.first_name,
      last_name: profile.data.last_name,
      email_address: profile.data.email_address,
      emailConfirmationRequired:
        emailChanged && authUpdate.data.user.email !== email,
    });
    return true;
  }

  if (pathname === "/api/friend-code" && request.method === "GET") {
    const { client, user } = await requireSession(request, response);
    const result = await client
      .from("User")
      .select("friend_code")
      .eq("user_id", user.id)
      .single();
    if (result.error) throw supabaseFailure(result.error);

    const friendCode =
      typeof result.data.friend_code === "string"
        ? result.data.friend_code.trim().toUpperCase()
        : "";
    if (!/^[A-Z0-9]{6}$/.test(friendCode)) {
      throw new HttpError(502, "The account does not have a valid friend code.");
    }
    sendJson(response, 200, { friendCode });
    return true;
  }

  return false;
}
