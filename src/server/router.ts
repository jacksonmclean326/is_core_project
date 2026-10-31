import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { handleApi } from "./api/index.js";
import { HttpError } from "./errors.js";
import { sendJson } from "./http/response.js";
import { pageFiles, servePage } from "./web/pages.js";
import { serveStatic } from "./web/static.js";

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url.pathname);
    } else if (url.pathname === "/") {
      await servePage(request, response, "root");
    } else if (pageFiles.has(url.pathname)) {
      const route = pageFiles.get(url.pathname);
      if (!route) throw new HttpError(404, "Page not found.");
      await servePage(request, response, route);
    } else {
      const legacyPage = [...pageFiles.entries()].find(
        ([, name]) => url.pathname === `/src/app/pages/${name}/${name}.html`,
      );
      if (legacyPage) {
        await servePage(request, response, legacyPage[1]);
        return;
      }
      await serveStatic(request, response, url.pathname);
    }
  } catch (error: unknown) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) console.error("Backend request failed.", error);
    if (response.headersSent) {
      response.destroy();
      return;
    }
    sendJson(response, status, {
      error:
        error instanceof Error
          ? error.message
          : "The request could not be completed.",
    });
  }
}

export function createHttpServer() {
  return createServer(handleRequest);
}
