import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError } from "../errors.js";
import { sendJson } from "../http/response.js";
import { handleGoalsApi } from "./goals.js";
import { handleAccountApi } from "./account.js";
import { handleAuthApi } from "./auth.js";
import { handleBudgetApi } from "./budget.js";
import { handleCategoriesApi } from "./categories.js";
import { handleManualTransactionsApi } from "./manual-transactions.js";
import { handlePlaidApi } from "./plaid.js";
import { handleTransactionsApi } from "./transactions.js";
import { handleChatApi } from "./chat.js";
import { handleFeedbackApi } from "./feedback.js";
import { handleLeaderboardApi } from "./leaderboard.js";
import { handleFriendsApi } from "./friends.js";
import { handleRatesApi } from "./rates.js";

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
  if (await handleGoalsApi(request, response, pathname)) return;
  if (await handleLeaderboardApi(request, response, pathname)) return;
  if (await handleFriendsApi(request, response, pathname)) return;
  if (await handleAccountApi(request, response, pathname)) return;
  if (await handleBudgetApi(request, response, pathname)) return;
  if (await handleCategoriesApi(request, response, pathname)) return;
  if (await handleManualTransactionsApi(request, response, pathname)) return;
  if (await handleTransactionsApi(request, response, pathname)) return;
  if (await handleChatApi(request, response, pathname)) return;
  if (await handleFeedbackApi(request, response, pathname)) return;
  if (await handleRatesApi(request, response, pathname)) return;

  if (pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "API endpoint not found." });
    return;
  }

  throw new HttpError(405, "Method not allowed.");
}
