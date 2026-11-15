import type { IncomingMessage, ServerResponse } from "node:http";
import { requireSession } from "../auth/session.js";
import type { SessionClient } from "../auth/supabase.js";
import { HttpError, supabaseFailure } from "../errors.js";
import { readJsonBody } from "../http/request-body.js";
import { sendJson } from "../http/response.js";
import { isMonthKey, utcDateString } from "../../shared/months.js";

interface BudgetRow {
  budget_id: string;
  monthly_budget: number;
  monthly_income: number;
  month: string | null;
}

function monthStart(value: unknown): string {
  const monthKey = value ?? utcDateString().slice(0, 7);
  if (!isMonthKey(monthKey)) throw new HttpError(400, "month must look like 2026-10.");
  return `${monthKey}-01`;
}

function publicBudget(row: BudgetRow | null, carriedFrom: string | null = null) {
  return row
    ? {
        budgetId: row.budget_id,
        monthlyBudget: row.monthly_budget || null,
        monthlyIncome: row.monthly_income,
        month: row.month,
        // Set when this month has no budget of its own yet and the most recent earlier one is used.
        carriedFrom,
      }
    : null;
}

/**
 * The budget for a month: that month's own row, or else the most recent earlier one, so a new month starts with
 * last month's income and budget instead of blank. `carriedFrom` is the month it came from (YYYY-MM), if carried.
 */
export async function budgetForMonth(
  client: SessionClient,
  userId: string,
  monthStartDate: string,
): Promise<{ row: BudgetRow | null; carriedFrom: string | null }> {
  const select = "budget_id,monthly_budget,monthly_income,month";
  const own = await client.from("Budget").select(select).eq("user_id", userId).eq("month", monthStartDate)
    .order("budget_id", { ascending: true }).limit(1).maybeSingle<BudgetRow>();
  if (own.error) throw supabaseFailure(own.error);
  if (own.data) return { row: own.data, carriedFrom: null };
  const earlier = await client.from("Budget").select(select).eq("user_id", userId).lt("month", monthStartDate)
    .order("month", { ascending: false }).limit(1).maybeSingle<BudgetRow>();
  if (earlier.error) throw supabaseFailure(earlier.error);
  return { row: earlier.data, carriedFrom: earlier.data?.month ? earlier.data.month.slice(0, 7) : null };
}

export async function handleBudgetApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== "/api/budget") return false;

  const { client, user } = await requireSession(request, response);

  if (request.method === "GET") {
    const url = new URL(request.url ?? pathname, "http://localhost");
    const month = monthStart(url.searchParams.get("month") ?? undefined);
    const { row, carriedFrom } = await budgetForMonth(client, user.id, month);
    sendJson(response, 200, { budget: publicBudget(row, carriedFrom) });
    return true;
  }

  if (request.method === "POST") {
    const body = await readJsonBody(request);
    const month = monthStart(body.month);
    const monthlyBudget = body.monthlyBudget === null ? 0 : body.monthlyBudget;
    const monthlyIncome = body.monthlyIncome;
    if (
      typeof monthlyBudget !== "number" ||
      !Number.isFinite(monthlyBudget) ||
      monthlyBudget < 0 ||
      typeof monthlyIncome !== "number" ||
      !Number.isFinite(monthlyIncome) ||
      monthlyIncome <= 0
    ) {
      throw new HttpError(400, "Enter a valid budget and monthly income.");
    }
    if (monthlyBudget > 0 && monthlyBudget > monthlyIncome) {
      throw new HttpError(400, "Your budget should fit within your monthly income.");
    }

    const existing = await client
      .from("Budget")
      .select("budget_id")
      .eq("user_id", user.id)
      .eq("month", month)
      .order("budget_id", { ascending: true })
      .limit(1)
      .maybeSingle<{ budget_id: string }>();
    if (existing.error) throw supabaseFailure(existing.error);

    const values = {
      monthly_budget: monthlyBudget,
      monthly_income: monthlyIncome,
      month,
      user_id: user.id,
    };
    const result = existing.data
      ? await client
          .from("Budget")
          .update(values)
          .eq("budget_id", existing.data.budget_id)
          .eq("user_id", user.id)
          .select("budget_id,monthly_budget,monthly_income,month")
          .single<BudgetRow>()
      : await client
          .from("Budget")
          .insert(values)
          .select("budget_id,monthly_budget,monthly_income,month")
          .single<BudgetRow>();
    if (result.error) throw supabaseFailure(result.error);

    sendJson(response, 200, { budget: publicBudget(result.data) });
    return true;
  }

  return false;
}