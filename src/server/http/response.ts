import type { IncomingMessage, ServerResponse } from "node:http";
import { TLSSocket } from "node:tls";
import { sessionCookieName, sessionLifetimeSeconds } from "../auth/constants.js";

export function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(JSON.stringify(value));
}

export function cookieHeader(sessionId: string, request: IncomingMessage): string {
  const secure =
    process.env.NODE_ENV === "production" ||
    request.socket instanceof TLSSocket;
  return [
    `${sessionCookieName}=${sessionId}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${sessionId ? sessionLifetimeSeconds : 0}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function sendRedirect(response: ServerResponse, location: string): void {
  response.writeHead(302, { "Cache-Control": "no-store", Location: location });
  response.end();
}
