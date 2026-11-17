import type { IncomingMessage, ServerResponse } from "node:http";
import { hiddenSourceIds, withoutHidden } from "../accounts/hidden-sources.js";
import { monthName, monthRange, utcDateString } from "../../shared/months.js";
import { plainText } from "../../shared/plain-text.js";
import { requireSession } from "../auth/session.js";
import { createServiceSupabaseClient, type SessionClient } from "../auth/supabase.js";
import { config } from "../config.js";
import { HttpError, supabaseFailure } from "../errors.js";
import { readJsonBody, requiredString } from "../http/request-body.js";
import { sendJson } from "../http/response.js";
import { withGoalProgress } from "./goals.js";
import { createMoneyFormatter, currencyOrDefault } from "../../shared/currencies.js";
import { rateFor } from "../currency/rates.js";

type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatTurnRow = {
  chat_id: string;
  user_input: string;
  chatbot_response: string | null;
  datestamp: string;
};
type TransactionRow = {
  amount: number | null;
  date: string | null;
  category_key: string | null;
};
type BudgetRow = {
  month: string | null;
  monthly_budget: number | null;
};
type GoalRow = {
  goal_type: string | null;
  goal_name: string | null;
  desired_savings: number | null;
  amount_savings: number | null;
  category_key: string | null;
  target_date: string | null;
};

const model = "openai/gpt-oss-20b";
const pageSize = 1000;
const categoryNames: Record<string, string> = {
  housing: "Housing",
  food: "Food",
  transport: "Transport",
  utilities: "Utilities",
  education: "Education",
  personal: "Personal",
  other: "Other",
};

async function readChatTurns(client: SessionClient, userId: string): Promise<ChatTurnRow[]> {
  const turns: ChatTurnRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await client
      .from("Chatbot History")
      .select("chat_id,user_input,chatbot_response,datestamp")
      .eq("user_id", userId)
      .order("datestamp", { ascending: true })
      .order("chat_id", { ascending: true })
      .range(from, from + pageSize - 1)
      .returns<ChatTurnRow[]>();
    if (result.error) throw supabaseFailure(result.error);
    const rows = result.data ?? [];
    turns.push(...rows);
    if (rows.length < pageSize) break;
  }
  return turns;
}

function modelHistory(turns: ChatTurnRow[]): ChatMessage[] {
  return turns.flatMap((turn) => [
    ...(turn.user_input.trim()
      ? [{ role: "user" as const, content: turn.user_input }]
      : []),
    ...(turn.chatbot_response?.trim()
      ? [{ role: "assistant" as const, content: turn.chatbot_response }]
      : []),
  ]);
}

function publicHistory(turns: ChatTurnRow[]) {
  return turns.flatMap((turn) => [
    ...(turn.user_input.trim()
      ? [{ id: `${turn.chat_id}:user`, role: "user" as const, content: turn.user_input, createdAt: turn.datestamp }]
      : []),
    ...(turn.chatbot_response?.trim()
      ? [{ id: `${turn.chat_id}:assistant`, role: "assistant" as const, content: turn.chatbot_response, createdAt: turn.datestamp }]
      : []),
  ]);
}

async function loadSpendingContext(userId: string, currency: string) {
  if (!config.supabaseSecretKey) {
    throw new HttpError(
      503,
      "Chat context is not configured. Set SUPABASE_SECRET_KEY on the server.",
    );
  }
  const admin = createServiceSupabaseClient();
  const today = utcDateString();
  const months = monthRange(today.slice(0, 7), 6);
  const start = `${months[0]}-01T00:00:00Z`;
  const end = `${today}T23:59:59Z`;
  const monthStarts = months.map((month) => `${month}-01`);

  const [budgetsResult, goalsResult, categoriesResult] = await Promise.all([
    admin
      .from("Budget")
      .select("month,monthly_budget")
      .eq("user_id", userId)
      .in("month", monthStarts)
      .returns<BudgetRow[]>(),
    admin
      .from("Goal")
      .select("goal_type,goal_name,desired_savings,amount_savings,category_key,target_date")
      .eq("user_id", userId)
      .order("goal_id")
      .returns<GoalRow[]>(),
    admin
      .from("Custom Category")
      .select("category_key,name")
      .eq("user_id", userId)
      .returns<{ category_key: string; name: string }[]>(),
  ]);
  if (budgetsResult.error) throw supabaseFailure(budgetsResult.error);
  if (goalsResult.error) throw supabaseFailure(goalsResult.error);
  if (categoriesResult.error) throw supabaseFailure(categoriesResult.error);

  const categoryNamesForUser = new Map(Object.entries(categoryNames));
  for (const category of categoriesResult.data ?? [])
    categoryNamesForUser.set(category.category_key, category.name);

  const byMonth = new Map(
    months.map((month) => [
      month,
      { cents: 0, transactionCount: 0, categoryCents: new Map<string, number>() },
    ]),
  );
  const hidden = await hiddenSourceIds(admin, userId);
  for (let from = 0; ; from += pageSize) {
    const result = await withoutHidden(
      admin
        .from("Transaction")
        .select("amount,date,category_key")
        .eq("user_id", userId)
        .gte("date", start)
        .lte("date", end),
      hidden,
    )
      .order("date", { ascending: true })
      .order("transaction_id", { ascending: true })
      .range(from, from + pageSize - 1)
      .returns<TransactionRow[]>();
    if (result.error) throw supabaseFailure(result.error);
    const rows = result.data ?? [];
    for (const row of rows) {
      if (
        !row.date ||
        typeof row.amount !== "number" ||
        !Number.isFinite(row.amount)
      )
        continue;
      const bucket = byMonth.get(row.date.slice(0, 7));
      if (!bucket) continue;
      const cents = Math.round(row.amount * 100);
      const key =
        row.category_key && categoryNamesForUser.has(row.category_key)
          ? row.category_key
          : "other";
      bucket.cents += cents;
      bucket.transactionCount += 1;
      bucket.categoryCents.set(
        key,
        (bucket.categoryCents.get(key) ?? 0) + cents,
      );
    }
    if (rows.length < pageSize) break;
  }

  // Amounts are stored in dollars. The assistant gets them in the display currency, so what it says matches the screen.
  const rate = (await rateFor(currency)) ?? 1;
  const shownCurrency = rate === 1 ? "USD" : currency;
  const fx = (amount: number) => Math.round(amount * rate * 100) / 100;
  const budgets = new Map(
    (budgetsResult.data ?? []).map((row) => [row.month?.slice(0, 7), row]),
  );
  // Say which month is which in words: given only "2026-11", the model treated the newest month as "last month"
  // even though it is the current, unfinished one.
  const currentMonth = months[months.length - 1];
  const previousMonth = months[months.length - 2];
  const monthLabel = (month: string) =>
    `${monthName(month)} ${month.slice(0, 4)}${month === currentMonth ? " (this month, so far)" : month === previousMonth ? " (last month)" : ""}`;
  const monthlySpending = months.map((month) => {
    const bucket = byMonth.get(month);
    const budget = budgets.get(month);
    return {
      month,
      label: monthLabel(month),
      transactionCount: bucket?.transactionCount ?? 0,
      spendingTotal: fx((bucket?.cents ?? 0) / 100),
      spendingByCategory: Object.fromEntries(
        [...(bucket?.categoryCents ?? new Map())].map(([key, cents]) => [
          categoryNamesForUser.get(key) ?? "Other",
          fx(cents / 100),
        ]),
      ),
      ...(budget ? { monthlyBudget: budget.monthly_budget === null ? null : fx(budget.monthly_budget) } : {}),
    };
  });
  const latestMonthWithTransactions = [...monthlySpending]
    .reverse()
    .find((month) => month.transactionCount > 0);
  const focusCandidates = latestMonthWithTransactions
    ? Object.entries(latestMonthWithTransactions.spendingByCategory)
        .filter(([, amount]) => amount > 0)
        .sort((first, second) => second[1] - first[1])
        .slice(0, 3)
        .map(([category, amount]) => ({ category, amount }))
    : [];

  const goalsWithProgress = await withGoalProgress(userId, goalsResult.data ?? [], currency);

  return {
    currency: shownCurrency,
    transactionsThrough: today,
    thisMonth: monthLabel(currentMonth),
    lastMonth: monthLabel(previousMonth),
    monthlySpending,
    latestMonthWithTransactions: latestMonthWithTransactions ? monthLabel(latestMonthWithTransactions.month) : null,
    focusCandidates,
    goals: goalsWithProgress.map((goal) => ({
      type: goal.goal_type,
      name: goal.goal_name,
      // A checklist goal counts steps, not money.
      target: goal.goal_type === "Checklist" || goal.desired_savings === null ? goal.desired_savings : fx(goal.desired_savings),
      savedProgress: goal.goal_type === "Checklist" ? goal.progress : fx(goal.progress),
      ...(goal.goal_type === "Checklist" ? { unit: "steps (savedProgress steps done out of target steps)" } : {}),
      ...(goal.category_key ? { category: categoryNamesForUser.get(goal.category_key) ?? goal.category_key } : {}),
      ...(goal.target_date ? { deadline: goal.target_date.slice(0, 10) } : {}),
      ...(goal.automatic ? { progressBasis: "current month, calculated from recorded transactions and saved monthly income" } : {}),
    })),
  };
}

/** Where things are in Money Man, so the assistant can point to real places instead of inventing buttons. */
const appGuide = `How Money Man works (use this to tell people where to go; never describe buttons or menus that are not listed here):
- You can only read the account context. You cannot change budgets, goals, categories, transactions, settings or anything else, and you must never say or imply that you did. If someone asks you to change something, say you can't make changes and tell them where to do it.
- Monthly income and budget: Settings (gear icon, top right), "Budget & income", then Save.
- Goals: Details tab, "Edit goals". Savings and Spending goals update automatically from transactions; other goals are typed in.
- Categories and category limits: Details tab, "Edit categories", or tap a category.
- Adding a cash purchase: Details tab, "Add transaction". Tap a transaction to change its category, or to edit or delete one you added.
- Banks: Accounts tab, "Connect an account" or "Refresh balances". Bank data syncs on its own; there is no separate sync button.
- Display currency and preferences: Settings.
- Friends and the leaderboard: Friends tab.
- Changes show up after reloading the page.`;

export async function handleChatApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== "/api/chat") return false;
  if (!["GET", "POST", "DELETE"].includes(request.method ?? ""))
    throw new HttpError(405, "Method not allowed.");

  const { client, user } = await requireSession(request, response);

  if (request.method === "GET") {
    const turns = await readChatTurns(client, user.id);
    sendJson(response, 200, { messages: publicHistory(turns) });
    return true;
  }

  if (request.method === "DELETE") {
    const result = await client
      .from("Chatbot History")
      .delete()
      .eq("user_id", user.id)
      .select("chat_id");
    if (result.error) throw supabaseFailure(result.error);
    sendJson(response, 200, { cleared: result.data?.length ?? 0 });
    return true;
  }

  if (!config.groqKey)
    throw new HttpError(
      503,
      "AI chat is not configured. Set GROQ_KEY on the server.",
    );

  const body = await readJsonBody(request);
  const userMessage = requiredString(body.message, "message", 1000);
  const turns = await readChatTurns(client, user.id);
  const context = await loadSpendingContext(user.id, currencyOrDefault(user.user_metadata?.currency));
  const amountExample = createMoneyFormatter(context.currency, 2).format(1912.5);
  const messages = [
    { role: "system", content: `You are Mr. Moneyman, a practical, careful budgeting assistant. Answer the user's actual question first.

Use only facts in the conversation and account context. "This month" is thisMonth in the context and is not finished yet; "last month" always means lastMonth, the month before it. Use each month's label to tell them apart, and name the month in your answer. The context contains saved records, not a complete picture of the user's finances. A zero transaction count means no transactions are recorded for that month; never claim the user spent nothing or guess why records are missing. Spending may be incomplete if bank activity has not synced. Goal progress is the amount tracked in this app, not a verified bank balance or proof of how much the user has saved.

For questions about where to reduce spending, use focusCandidates and name the month. These are the highest recorded category totals in the latest month that has transactions. Call them the largest recorded categories, not overspending. Context contains category totals, not merchant details, so don't claim which purchases are optional or suggest a specific transaction to cut; suggest reviewing that category's transactions in the app. If there are no focus candidates, say the saved data is insufficient to identify a category.

Never invent amounts, months, categories, savings progress, causes, budgets, caps, or goals. Don't suggest numeric targets unless the user asks for one and the available data supports a transparent calculation. Distinguish spending from budget. Be explicit when a comparison is unavailable.

${appGuide}

Write amounts the way the app shows them, with the currency symbol and thousands separators (for example ${amountExample}), never as a bare number followed by a currency code; write percentages like 90%.

Write plain text only: no Markdown, tables, headings, bullets, images, or decorative separators. Usually answer in 1–3 short sentences (under 70 words). If a detail is needed to avoid a guess, ask one clear follow-up question. Be warm without overpraising.

Account context (${context.currency}; amounts are shown in this currency, not converted):\n${JSON.stringify(context)}` },
    ...modelHistory(turns),
    { role: "user", content: userMessage },
  ];

  // gpt-oss "thinks" before answering and that thinking counts toward the token limit. With a small limit, a
  // question that needed more thought came back empty, so keep thinking short, allow room, and retry once.
  const ask = async (lowEffort: boolean): Promise<{ status: number; text: string | null }> => {
    let result: Response;
    try {
      result = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_completion_tokens: 1200,
          ...(lowEffort ? { reasoning_effort: "low" } : {}),
          messages,
        }),
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      throw new HttpError(502, "Groq could not be reached. Please try again.");
    }
    if (!result.ok) return { status: result.status, text: null };
    const completion: unknown = await result.json().catch(() => null);
    const choices = completion && typeof completion === "object" ? (completion as { choices?: unknown }).choices : null;
    const first = Array.isArray(choices) ? choices[0] : null;
    const content = first && typeof first === "object" ? (first as { message?: { content?: unknown } }).message?.content : null;
    return { status: 200, text: typeof content === "string" && content.trim() ? content : null };
  };

  let answer = await ask(true);
  // If the reasoning setting is ever refused, ask again without it rather than failing.
  if (answer.status === 400) answer = await ask(false);
  if (answer.status === 200 && answer.text === null) answer = await ask(true);
  if (answer.status !== 200) {
    // Keep provider response bodies and request credentials out of client errors and server logs.
    throw new HttpError(502, "Groq could not complete that reply. Please try again.");
  }
  const reply = answer.text;
  if (reply === null) {
    throw new HttpError(502, "Mr. Moneyman couldn't come up with an answer that time. Please try asking again.");
  }
  const cleanReply = plainText(reply);
  if (!cleanReply) throw new HttpError(502, "Groq returned an empty reply. Please try again.");
  const savedTurn = await client
    .from("Chatbot History")
    .insert({ user_id: user.id, user_input: userMessage, chatbot_response: cleanReply })
    .select("chat_id,datestamp")
    .single<{ chat_id: string; datestamp: string }>();
  if (savedTurn.error) throw supabaseFailure(savedTurn.error);
  sendJson(response, 200, {
    reply: cleanReply,
    chatId: savedTurn.data.chat_id,
    createdAt: savedTurn.data.datestamp,
  });
  return true;
}
