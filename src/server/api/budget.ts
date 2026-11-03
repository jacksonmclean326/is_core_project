import type { IncomingMessage, ServerResponse } from "node:http";
import { requireSession } from "../auth/session.js";
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

function publicBudget(row: BudgetRow | null) {
  return row
    ? {
        budgetId: row.budget_id,
        monthlyBudget: row.monthly_budget || null,
        monthlyIncome: row.monthly_income,
        month: row.month,
      }
    : null;
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
    const result = await client
      .from("Budget")
      .select("budget_id,monthly_budget,monthly_income,month")
      .eq("user_id", user.id)
      .eq("month", month)
      .order("budget_id", { ascending: true })
      .limit(1)
      .maybeSingle<BudgetRow>();
    if (result.error) throw supabaseFailure(result.error);
    sendJson(response, 200, { budget: publicBudget(result.data) });
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