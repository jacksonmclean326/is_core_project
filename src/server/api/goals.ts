import type { IncomingMessage, ServerResponse } from "node:http";
import { requireSession } from "../auth/session.js";
import { HttpError, isRecord, supabaseFailure } from "../errors.js";
import { readJsonBody } from "../http/request-body.js";
import { sendJson } from "../http/response.js";

export async function handleGoalsApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== "/api/goals") return false;
  if (request.method !== "GET" && request.method !== "PUT") {
    throw new HttpError(405, "Method not allowed.");
  }
  const { client, user } = await requireSession(request, response);
  if (request.method === "GET") {
    const result = await client.from("Goal")
      .select("goal_id, goal_type, goal_name, desired_savings, amount_savings")
      .eq("user_id", user.id).order("goal_id");
    if (result.error) throw supabaseFailure(result.error);
    sendJson(response, 200, { goals: result.data });
    return true;
  }
  const { items } = await readJsonBody(request);
  if (!Array.isArray(items) || items.some((item) =>
    !isRecord(item) || typeof item.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id) ||
    typeof item.kind !== "string" || !["Savings", "Spending", "Earnings", "Investing"].includes(item.kind) ||
    typeof item.name !== "string" || !item.name.trim() || item.name.trim().length > 36 ||
    typeof item.target !== "number" || !Number.isFinite(item.target) || item.target <= 0
  )) throw new HttpError(400, "Each goal needs a valid ID, type, name, and positive target.");
  const result = await client.rpc("save_user_goals", {
    items: items.map(({ id, kind, name, target }) => ({ id, kind, name, target }))
  });
  if (result.error) throw supabaseFailure(result.error);
  sendJson(response, 200, { goals: result.data });
  return true;
}
