import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError, supabaseFailure } from "../errors.js";
import { readJsonBody, requiredString } from "../http/request-body.js";
import { cookieHeader, sendJson } from "../http/response.js";
import { isAdminUser } from "../auth/admin.js";
import { publicUser, requireSession, signIn, signOut } from "../auth/session.js";

export async function handleAuthApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === "/api/auth/session" && request.method === "GET") {
    try {
      const { user } = await requireSession(request, response);
      sendJson(response, 200, {
        user: {
          ...publicUser(user),
          isAdmin: await isAdminUser(user),
          dark_mode: user.user_metadata?.dark_mode === true,
        },
      });
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        sendJson(response, 200, { user: null });
        return true;
      }
      throw error;
    }
    return true;
  }

  if (
    (pathname === "/api/auth/signin" || pathname === "/api/auth/signup") &&
    request.method === "POST"
  ) {
    const body = await readJsonBody(request);
    const email = requiredString(body.email, "Email");
    if (
      typeof body.password !== "string" ||
      !body.password ||
      body.password.length > 1024
    ) {
      throw new HttpError(400, "Password is required.");
    }

    let signUpDetails:
      | { firstName: string; lastName: string; fullName: string; referralCode?: string }
      | undefined;
    if (pathname === "/api/auth/signup") {
      const referralCode = body.referralCode;
      if (
        referralCode !== undefined &&
        referralCode !== null &&
        (typeof referralCode !== "string" || !/^[A-HJ-NP-Z2-9]{6}$/.test(referralCode))
      ) {
        throw new HttpError(400, "The friend invitation link is invalid.");
      }
      signUpDetails = {
        firstName: requiredString(body.firstName, "First name", 100),
        lastName: requiredString(body.lastName, "Last name", 100),
        fullName: requiredString(body.fullName, "Full name", 200),
        ...(typeof referralCode === "string" ? { referralCode } : {}),
      };
    }
    const result = await signIn(
      request,
      response,
      { email, password: body.password },
      signUpDetails,
    );
    sendJson(response, 200, result);
    return true;
  }

  if (pathname === "/api/auth/signout" && request.method === "POST") {
    await signOut(request);
    sendJson(
      response,
      200,
      { ok: true },
      { "Set-Cookie": cookieHeader("", request) },
    );
    return true;
  }

  return false;
}
