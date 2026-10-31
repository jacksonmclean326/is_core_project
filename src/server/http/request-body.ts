import type { IncomingMessage } from "node:http";
import { HttpError, isRecord } from "../errors.js";

export async function readJsonBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  if (
    !request.headers["content-type"]
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new HttpError(415, "Content-Type must be application/json.");
  }

  let body = "";
  for await (const chunk of request) {
    body += Buffer.from(chunk).toString("utf8");
    if (Buffer.byteLength(body) > 16_384) {
      throw new HttpError(413, "Request body is too large.");
    }
  }

  try {
    const value: unknown = JSON.parse(body);
    if (!isRecord(value) || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
}

export function requiredString(
  value: unknown,
  field: string,
  maxLength = 320,
): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new HttpError(400, `${field} is required.`);
  }
  return value.trim();
}
