import type { IncomingMessage, ServerResponse } from "node:http";
import { requireSession } from "../auth/session.js";
import { HttpError } from "../errors.js";
import { sendJson } from "../http/response.js";
import { getRates } from "../rates.js";

export async function handleRatesApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== "/api/rates") return false;
  if (request.method !== "GET") throw new HttpError(405, "Method not allowed.");
  await requireSession(request, response);
  const snapshot = await getRates();
  if (!snapshot) throw new HttpError(503, "Exchange rates are unavailable right now. Please try again in a moment.");
  sendJson(response, 200, { base: snapshot.base, date: snapshot.date, rates: snapshot.rates });
  return true;
}
