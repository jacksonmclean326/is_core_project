import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError } from "../errors.js";
import { sendJson } from "../http/response.js";
import { handleAccountApi } from "./account.js";
import { handleAuthApi } from "./auth.js";
import { handlePlaidApi } from "./plaid.js";

export async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<void> {
  if (pathname === "/api/health" && request.method === "GET") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (await handleAuthApi(request, response, pathname)) return;
  if (await handlePlaidApi(request, response, pathname)) return;
  if (await handleAccountApi(request, response, pathname)) return;

  if (pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "API endpoint not found." });
    return;
  }

  throw new HttpError(405, "Method not allowed.");
}
