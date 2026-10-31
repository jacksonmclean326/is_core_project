import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config.js";
import { errorCode, HttpError } from "../errors.js";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

export async function serveStatic(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new HttpError(405, "Method not allowed.");
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, "Invalid URL path.");
  }

  const relativePath = decodedPath === "/" ? "/index.html" : decodedPath;
  if (relativePath.endsWith(".html")) {
    throw new HttpError(404, "Page not found.");
  }
  const filePath = resolve(config.distributionDirectory, `.${relativePath}`);
  if (!filePath.startsWith(`${config.distributionDirectory}${sep}`)) {
    throw new HttpError(403, "Forbidden.");
  }

  let contents: Buffer;
  try {
    contents = await readFile(filePath);
  } catch (error) {
    if (errorCode(error) === "ENOENT" || errorCode(error) === "EISDIR") {
      throw new HttpError(
        404,
        "File not found. Build the frontend before starting the production server.",
      );
    }
    throw error;
  }

  response.writeHead(200, {
    "Cache-Control": "no-cache",
    "Content-Type":
      contentTypes.get(extname(filePath)) || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(request.method === "HEAD" ? undefined : contents);
}
