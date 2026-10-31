import type { IncomingMessage, ServerResponse } from "node:http";
import { publicUser, requireSession } from "../auth/session.js";
import { HttpError, supabaseFailure } from "../errors.js";
import { sendJson } from "../http/response.js";

export async function handleAccountApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === "/api/account" && request.method === "GET") {
    const { user } = await requireSession(request, response);
    sendJson(response, 200, publicUser(user));
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
