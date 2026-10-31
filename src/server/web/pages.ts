import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { requireSession } from "../auth/session.js";
import { config } from "../config.js";
import { errorCode, HttpError } from "../errors.js";
import { sendRedirect } from "../http/response.js";

export type PageRoute =
  | "auth"
  | "home"
  | "details"
  | "chat"
  | "leaderboard"
  | "settings";

export const pageFiles = new Map<string, PageRoute>([
  ["/auth", "auth"],
  ["/home", "home"],
  ["/details", "details"],
  ["/chat", "chat"],
  ["/leaderboard", "leaderboard"],
  ["/settings", "settings"],
]);

export async function servePage(
  request: IncomingMessage,
  response: ServerResponse,
  route: PageRoute | "root",
): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new HttpError(405, "Method not allowed.");
  }

  let user = null;
  try {
    ({ user } = await requireSession(request, response));
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 401) throw error;
  }

  if (route === "root") {
    sendRedirect(response, user ? "/home" : "/auth");
    return;
  }
  if (route === "auth" && user) {
    sendRedirect(response, "/home");
    return;
  }
  if (route !== "auth" && !user) {
    response.writeHead(302, {
      "Cache-Control": "no-store",
      Location: "/auth",
      ...(response.getHeader("Set-Cookie")
        ? { "Set-Cookie": response.getHeader("Set-Cookie") }
        : {}),
    });
    response.end();
    return;
  }

  const filePath = resolve(
    config.distributionDirectory,
    "src",
    "app",
    "pages",
    route,
    `${route}.html`,
  );
  let contents: Buffer;
  try {
    contents = await readFile(filePath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new HttpError(
        404,
        "Page not found. Build the frontend before starting the server.",
      );
    }
    throw error;
  }

  response.writeHead(200, {
    "Cache-Control": "no-cache",
    "Content-Type": "text/html; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(request.method === "HEAD" ? undefined : contents);
}
