import type { IncomingMessage, ServerResponse } from "node:http";
import { hiddenSourceIds, withoutHidden } from "../hidden-accounts.js";
import { addMonths, isDateString, monthStart, utcDateString } from "../../shared/months.js";
import {
  computeGoalProgress,
  isAutomaticKind,
  isGoalKind,
  parseSteps,
  type GoalStep,
  type MonthFacts,
} from "../../shared/goal-progress.js";
import { currencyOrDefault } from "../../shared/currencies.js";
import { rateFor } from "../rates.js";
import { requireSession } from "../auth/session.js";
import { createServiceSupabaseClient, type SessionClient } from "../auth/supabase.js";
import { isBuiltInCategory, isCategoryKey } from "../categorize.js";
import { listCustomCategories } from "../category-store.js";
import { config } from "../config.js";
import { HttpError, isRecord, supabaseFailure } from "../errors.js";
import { readJsonBody } from "../http/request-body.js";
import { sendJson } from "../http/response.js";

const pageSize = 1000;
const baseGoalColumns = "goal_id, goal_type, goal_name, desired_savings, amount_savings, category_key, target_date";
const goalColumns = `${baseGoalColumns}, steps`;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the user has spent, earned (budget income) and budgeted so far in the current month. */
async function loadMonthFacts(admin: SessionClient, userId: string): Promise<MonthFacts> {
  const today = utcDateString();
  const month = today.slice(0, 7);
  const from = `${monthStart(month)}T00:00:00Z`;
  const to = `${monthStart(addMonths(month, 1))}T00:00:00Z`;

  let totalCents = 0;
  const categoryCents = new Map<string, number>();
  const hidden = await hiddenSourceIds(admin, userId);
  for (let offset = 0; ; offset += pageSize) {
    const result = await withoutHidden(
      admin
        .from("Transaction")
        .select("amount,category_key")
        .eq("user_id", userId)
        .gte("date", from)
        .lt("date", to),
      hidden,
    )
      .order("transaction_id", { ascending: true })
      .range(offset, offset + pageSize - 1)
      .returns<{ amount: number | null; category_key: string | null }[]>();
    if (result.error) throw supabaseFailure(result.error);
    const rows = result.data ?? [];
    for (const row of rows) {
      if (typeof row.amount !== "number" || !Number.isFinite(row.amount)) continue;
      const amountCents = Math.round(row.amount * 100);
      totalCents += amountCents;
      const key = row.category_key || "other";
      categoryCents.set(key, (categoryCents.get(key) ?? 0) + amountCents);
    }
    if (rows.length < pageSize) break;
  }

  const budget = await admin
    .from("Budget")
    .select("monthly_budget,monthly_income")
    .eq("user_id", userId)
    .eq("month", monthStart(month))
    .order("budget_id", { ascending: true })
    .limit(1)
    .maybeSingle<{ monthly_budget: number | null; monthly_income: number | null }>();
  if (budget.error) throw supabaseFailure(budget.error);

  return {
    today,
    spent: totalCents / 100,
    spentByCategory: Object.fromEntries([...categoryCents].map(([key, value]) => [key, value / 100])),
    income: budget.data?.monthly_income ?? null,
    budget: budget.data?.monthly_budget ?? null,
  };
}

/**
 * Adds `progress`, `automatic` and `note` to goal rows. Savings and Spending goals are worked out
 * from this month's transactions and budget; the other goals keep the amount the user saved.
 */
export async function withGoalProgress<
  T extends {
    goal_type: string | null;
    desired_savings: number | string | null;
    amount_savings: number | string | null;
    category_key?: string | null;
    target_date?: string | null;
    steps?: unknown;
  },
>(
  userId: string,
  rows: T[],
  currency?: string,
): Promise<(T & { progress: number; automatic: boolean; note: string | null })[]> {
  const loaded = config.supabaseSecretKey ? await loadMonthFacts(createServiceSupabaseClient(), userId) : null;
  // Amounts are stored in dollars; notes show them in the display currency (or dollars if no rate is known).
  const rate = currency ? await rateFor(currency) : null;
  const facts = loaded ? (currency && rate ? { ...loaded, currency, rate } : loaded) : null;
  return rows.map((row) => {
    const stored = Number(row.amount_savings ?? 0);
    const kind = row.goal_type ?? "";
    const result =
      facts && (isAutomaticKind(kind) || row.target_date)
        ? computeGoalProgress(
            {
              kind,
              stored,
              target: Number(row.desired_savings ?? 0),
              category: row.category_key ?? null,
              deadline: row.target_date ? row.target_date.slice(0, 10) : null,
            },
            facts,
          )
        : { progress: stored, automatic: false, note: null };
    return { ...row, ...result };
  });
}

interface GoalInput {
  id: string;
  kind: string;
  name: string;
  target: number;
  category: string | null;
  deadline: string | null;
  progress: number;
  steps: GoalStep[] | null;
}

/**
 * Reads a user's goals. Until the checklist migration has been run there is no `steps` column,
 * so fall back to the older columns instead of breaking every goals screen.
 */
async function selectGoals(client: SessionClient, userId: string) {
  const full = await client.from("Goal").select(goalColumns).eq("user_id", userId).order("goal_id");
  if (!full.error) return full.data;
  if (!/steps/i.test(full.error.message ?? "")) throw supabaseFailure(full.error);
  const base = await client.from("Goal").select(baseGoalColumns).eq("user_id", userId).order("goal_id");
  if (base.error) throw supabaseFailure(base.error);
  return base.data;
}

async function parseGoals(items: unknown, userId: string): Promise<GoalInput[]> {
  const bad = new HttpError(400, "Each goal needs a valid ID, type, name, and positive target.");
  if (!Array.isArray(items)) throw bad;
  const customKeys = items.some((item) => isRecord(item) && item.kind === "Spending" && item.category)
    ? new Set((await listCustomCategories(createServiceSupabaseClient(), userId)).map((category) => category.key))
    : new Set<string>();

  return items.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      !uuidPattern.test(item.id) ||
      !isGoalKind(item.kind) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.trim().length > 36 ||
      typeof item.target !== "number" ||
      !Number.isFinite(item.target) ||
      item.target <= 0
    ) throw bad;

    // A category only applies to Spending goals; it must be a built-in or one of the user's own.
    let category: string | null = null;
    if (item.kind === "Spending" && item.category) {
      if (!isCategoryKey(item.category) || !(isBuiltInCategory(item.category) || customKeys.has(item.category))) {
        throw new HttpError(400, "Choose a valid category for the spending goal.");
      }
      category = item.category;
    }

    // Progress and deadline are only typed in for manual goals.
    const manual = !isAutomaticKind(item.kind);
    let deadline: string | null = null;
    if (manual && item.deadline) {
      if (!isDateString(item.deadline)) throw new HttpError(400, "Choose a valid deadline.");
      deadline = item.deadline;
    }
    let progress = 0;
    if (manual && item.progress !== undefined && item.progress !== null) {
      if (typeof item.progress !== "number" || !Number.isFinite(item.progress) || item.progress < 0) {
        throw new HttpError(400, "Progress must be zero or more.");
      }
      progress = item.progress;
    }

    // A checklist goal is its steps: the target is how many there are and progress is how many are done.
    let steps: GoalStep[] | null = null;
    let target = item.target;
    if (item.kind === "Checklist") {
      steps = parseSteps(item.steps);
      if (!steps) throw new HttpError(400, "A checklist goal needs 1 to 20 steps, each up to 80 characters.");
      target = steps.length;
      progress = steps.filter((step) => step.done).length;
    }
    return { id: item.id, kind: item.kind, name: item.name.trim(), target, category, deadline, progress, steps };
  });
}

/** Ticks steps of one checklist goal without re-saving every goal. */
async function handleStepsPatch(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  if (request.method !== "PATCH") throw new HttpError(405, "Method not allowed.");
  const { client, user } = await requireSession(request, response);
  const body = await readJsonBody(request);
  const steps = parseSteps(body.steps);
  if (typeof body.id !== "string" || !uuidPattern.test(body.id) || !steps) {
    throw new HttpError(400, "Send the goal id and 1 to 20 steps.");
  }
  const existing = await client
    .from("Goal")
    .select("goal_id, goal_type")
    .eq("goal_id", body.id)
    .eq("user_id", user.id)
    .maybeSingle<{ goal_id: string; goal_type: string }>();
  if (existing.error) throw supabaseFailure(existing.error);
  if (!existing.data || existing.data.goal_type !== "Checklist") throw new HttpError(404, "That checklist goal was not found.");
  const updated = await client
    .from("Goal")
    .update({
      steps,
      desired_savings: steps.length,
      amount_savings: steps.filter((step) => step.done).length,
    })
    .eq("goal_id", body.id)
    .eq("user_id", user.id)
    .select(goalColumns)
    .single();
  if (updated.error) throw supabaseFailure(updated.error);
  const currency = currencyOrDefault(user.user_metadata?.currency);
  const [goal] = await withGoalProgress(user.id, [updated.data], currency);
  sendJson(response, 200, { goal });
  return true;
}

export async function handleGoalsApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === "/api/goals/steps") return handleStepsPatch(request, response);
  if (pathname !== "/api/goals") return false;
  if (request.method !== "GET" && request.method !== "PUT") {
    throw new HttpError(405, "Method not allowed.");
  }
  const { client, user } = await requireSession(request, response);
  if (request.method === "GET") {
    const rows = await selectGoals(client, user.id);
    const currency = currencyOrDefault(user.user_metadata?.currency);
    sendJson(response, 200, { goals: await withGoalProgress(user.id, rows, currency) });
    return true;
  }
  const { items } = await readJsonBody(request);
  const goals = await parseGoals(items, user.id);
  const result = await client.rpc("save_user_goals", { items: goals });
  if (result.error) throw supabaseFailure(result.error);
  const currency = currencyOrDefault(user.user_metadata?.currency);
  sendJson(response, 200, { goals: await withGoalProgress(user.id, result.data ?? [], currency) });
  return true;
}
