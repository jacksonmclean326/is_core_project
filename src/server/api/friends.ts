import type { IncomingMessage, ServerResponse } from "node:http";
import { requireSession } from "../auth/session.js";
import { HttpError, isRecord, supabaseFailure } from "../errors.js";
import { readJsonBody } from "../http/request-body.js";
import { sendJson } from "../http/response.js";

export async function handleFriendsApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== "/api/friends") return false;
  if (!["GET", "POST", "DELETE"].includes(request.method ?? "")) {
    throw new HttpError(405, "Method not allowed.");
  }
  const { client } = await requireSession(request, response);
  let result;
  if (request.method === "GET") {
    result = await client.rpc("list_friends");
  } else {
    const body = await readJsonBody(request);
    if (request.method === "POST") {
      const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
        throw new HttpError(400, "Enter a valid six-character friend code.");
      }
      result = await client.rpc("add_friend_by_code", { code });
    } else {
      if (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) {
        throw new HttpError(400, "Choose a valid friend to remove.");
      }
      result = await client.rpc("remove_friend", { friend_id: body.id });
    }
  }
  if (result.error) {
    const error = result.error;
    if (isRecord(error)) {
      const messages: Record<string, [number, string]> = {
        "22023": [400, "Enter someone else's valid six-character friend code."],
        P0002: [404, "No account matches that friend code."],
        "23505": [409, "You are already friends."],
        PGRST202: [503, "Friends is not set up yet. Apply the friends database migration."],
      };
      const mapped = messages[String(error.code)];
      if (mapped) throw new HttpError(...mapped);
    }
    throw supabaseFailure(error);
  }
  sendJson(response, request.method === "POST" ? 201 : 200,
    request.method === "GET" ? { friends: result.data ?? [] } : { ok: true });
  return true;
}
