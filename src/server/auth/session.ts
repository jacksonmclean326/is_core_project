import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { User } from "@supabase/supabase-js";
import { HttpError, isRecord, supabaseFailure } from "../errors.js";
import { cookieHeader } from "../http/response.js";
import { sessionCookieName } from "./constants.js";
import { createSupabaseClient, type SessionClient } from "./supabase.js";

const sessions = new Map<string, SessionClient>();

function getSessionId(request: IncomingMessage): string | null {
  const cookie = request.headers.cookie;
  if (!cookie) return null;
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookieName}=`))
    ?.slice(sessionCookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email ?? null,
    user_metadata: user.user_metadata ?? null,
  };
}

function isInvalidSession(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return error.status === 400 || error.status === 401 || error.status === 403;
}

async function authenticatedUser(client: SessionClient): Promise<User> {
  const current = await client.auth.getSession();
  if (current.error) throw supabaseFailure(current.error);
  let session = current.data.session;
  if (!session) throw new HttpError(401, "Please sign in again.");

  if (session.expires_at && session.expires_at * 1000 <= Date.now() + 60_000) {
    const refreshed = await client.auth.refreshSession();
    if (refreshed.error) {
      if (isInvalidSession(refreshed.error)) {
        throw new HttpError(
          401,
          "Your session has expired. Please sign in again.",
        );
      }
      throw supabaseFailure(refreshed.error);
    }
    session = refreshed.data.session;
    if (!session) {
      throw new HttpError(
        401,
        "Your session has expired. Please sign in again.",
      );
    }
  }

  const result = await client.auth.getUser(session.access_token);
  if (result.error) {
    if (isInvalidSession(result.error)) {
      throw new HttpError(
        401,
        "Your session has expired. Please sign in again.",
      );
    }
    throw supabaseFailure(result.error);
  }
  return result.data.user;
}

export async function requireSession(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<{ client: SessionClient; user: User; sessionId: string }> {
  const sessionId = getSessionId(request);
  const client = sessionId ? sessions.get(sessionId) : null;
  if (!sessionId || !client) {
    response.setHeader("Set-Cookie", cookieHeader("", request));
    throw new HttpError(401, "Please sign in again.");
  }

  try {
    const user = await authenticatedUser(client);
    return { client, user, sessionId };
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      sessions.delete(sessionId);
      response.setHeader("Set-Cookie", cookieHeader("", request));
    }
    throw error;
  }
}

export async function signIn(
  request: IncomingMessage,
  response: ServerResponse,
  input: { email: string; password: string },
  signUpDetails?: { firstName: string; lastName: string; fullName: string },
): Promise<{
  authenticated: boolean;
  user: ReturnType<typeof publicUser> | null;
}> {
  const client = createSupabaseClient();
  const result = signUpDetails
    ? await client.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            first_name: signUpDetails.firstName,
            last_name: signUpDetails.lastName,
            full_name: signUpDetails.fullName,
          },
        },
      })
    : await client.auth.signInWithPassword(input);

  if (result.error) {
    if (!signUpDetails && result.error.status === 400) {
      throw new HttpError(401, result.error.message);
    }
    throw supabaseFailure(result.error, 400);
  }

  if (result.data.session) {
    const sessionId = randomBytes(32).toString("hex");
    sessions.set(sessionId, client);
    response.setHeader("Set-Cookie", cookieHeader(sessionId, request));
  } else {
    response.setHeader("Set-Cookie", cookieHeader("", request));
  }

  return {
    authenticated: Boolean(result.data.session),
    user:
      result.data.session && result.data.user
        ? publicUser(result.data.user)
        : null,
  };
}

export async function signOut(request: IncomingMessage): Promise<void> {
  const sessionId = getSessionId(request);
  const client = sessionId ? sessions.get(sessionId) : null;
  if (sessionId) sessions.delete(sessionId);
  if (client) {
    const result = await client.auth.signOut({ scope: "local" });
    if (result.error) throw supabaseFailure(result.error);
  }
}
