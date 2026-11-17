import type { IncomingMessage, ServerResponse } from "node:http";
import {
  addDays,
  addMonths,
  currentMonthKey,
  daysInMonth,
  isDateString,
  isMonthKey,
  monthStart,
} from "../../shared/months.js";
import {
  currentMonthlyChallenge,
  scoreMonthlyChallenge,
  type ChallengeTransaction,
} from "../../shared/leaderboard.js";
import { hiddenSourceIds, withoutHidden } from "../accounts/hidden-sources.js";
import { requireSession } from "../auth/session.js";
import { createServiceSupabaseClient } from "../auth/supabase.js";
import { HttpError, supabaseFailure } from "../errors.js";
import { sendJson } from "../http/response.js";
import { budgetForMonth } from "./budget.js";

const pageSize = 1_000;
const friendBatchSize = 4;
type Admin = ReturnType<typeof createServiceSupabaseClient>;
type BudgetReader = Parameters<typeof budgetForMonth>[0];
type TrendPoint = { label: string; value: number };

interface TransactionRow {
  transaction_id: string;
  amount: number | null;
  date: string | null;
  category_key: string | null;
  name: string | null;
}

async function loadTransactions(
  admin: Admin,
  userId: string,
  month: string,
  hidden: Awaited<ReturnType<typeof hiddenSourceIds>>,
): Promise<ChallengeTransaction[]> {
  const transactions: ChallengeTransaction[] = [];
  const fromDate = `${monthStart(month)}T00:00:00Z`;
  const toDate = `${monthStart(addMonths(month, 1))}T00:00:00Z`;

  for (let offset = 0; ; offset += pageSize) {
    const result = await withoutHidden(
      admin
        .from("Transaction")
        .select("transaction_id,amount,date,category_key,name")
        .eq("user_id", userId)
        .gte("date", fromDate)
        .lt("date", toDate),
      hidden,
    )
      .order("date")
      .order("transaction_id")
      .range(offset, offset + pageSize - 1)
      .returns<TransactionRow[]>();

    if (result.error) throw supabaseFailure(result.error);
    transactions.push(...(result.data ?? []).map((row) => ({
      id: row.transaction_id,
      amount: row.amount,
      date: row.date,
      category: row.category_key,
      name: row.name,
    })));
    if ((result.data ?? []).length < pageSize) break;
  }

  return transactions;
}

function spendingTotal(transactions: ChallengeTransaction[]): number {
  return transactions.reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);
}

function savedEstimate(transactions: ChallengeTransaction[], monthlyIncome: number): number {
  return Math.max(0, monthlyIncome - spendingTotal(transactions));
}

function dailyFriendScores(
  challenge: ReturnType<typeof currentMonthlyChallenge>,
  transactions: ChallengeTransaction[],
  monthlyIncome: number | null,
  monthlyBudget: number | null,
  month: string,
  dayCount: number,
): TrendPoint[] {
  return Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(`${month}-01`, index);
    const throughDate = transactions.filter((row) => (row.date ?? "").slice(0, 10) <= date);
    const score = scoreMonthlyChallenge(challenge, throughDate, monthlyIncome, monthlyBudget).score;
    return { label: date.slice(8), value: Math.round(score * 100) / 100 };
  });
}

async function memberTrends(
  admin: Admin,
  member: { id: string; name: string },
  months: string[],
  month: string,
  dayCount: number,
): Promise<{
  id: string;
  name: string;
  monthly: TrendPoint[];
  daily: TrendPoint[];
}> {
  const hidden = await hiddenSourceIds(admin, member.id);
  const monthData = await Promise.all(months.map(async (key) => {
    const [transactions, budget] = await Promise.all([
      loadTransactions(admin, member.id, key, hidden),
      budgetForMonth(admin, member.id, `${key}-01`),
    ]);
    return { key, transactions, budget };
  }));
  const monthly = monthData.map(({ key, transactions, budget }) => {
    const challenge = currentMonthlyChallenge(new Date(`${key}-15T12:00:00Z`));
    const score = scoreMonthlyChallenge(
      challenge,
      transactions,
      budget.row?.monthly_income ?? null,
      budget.row?.monthly_budget ?? null,
    ).score;
    return { label: key, value: Math.round(score * 100) / 100 };
  });
  const current = monthData.find((row) => row.key === month)!;
  const challenge = currentMonthlyChallenge(new Date(`${month}-15T12:00:00Z`));

  return {
    id: member.id,
    name: member.name,
    monthly,
    daily: dailyFriendScores(
      challenge,
      current.transactions,
      current.budget.row?.monthly_income ?? null,
      current.budget.row?.monthly_budget ?? null,
      month,
      dayCount,
    ),
  };
}

async function ownTrends(
  client: BudgetReader,
  admin: Admin,
  userId: string,
  months: string[],
  month: string,
  previousMonth: string,
  dayCount: number,
) {
  const hidden = await hiddenSourceIds(admin, userId);
  const monthData = await Promise.all(months.map(async (key) => {
    const [transactions, budget] = await Promise.all([
      loadTransactions(admin, userId, key, hidden),
      budgetForMonth(client, userId, `${key}-01`),
    ]);
    return { key, transactions, budget };
  }));
  const monthly = monthData.map(({ key, transactions, budget }) => ({
    label: key,
    spent: spendingTotal(transactions),
    saved: savedEstimate(transactions, budget.row?.monthly_income ?? budget.row?.monthly_budget ?? 0),
  }));
  const current = monthData.find((row) => row.key === month)!;
  const previousTransactions = await loadTransactions(admin, userId, previousMonth, hidden);
  const income = current.budget.row?.monthly_income ?? current.budget.row?.monthly_budget ?? 0;
  let spentThroughDay = 0;
  const daily = Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(`${month}-01`, index);
    const spent = current.transactions
      .filter((row) => (row.date ?? "").slice(0, 10) === date)
      .reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);
    spentThroughDay += spent;
    return { label: date.slice(8), spent, saved: Math.max(0, income - spentThroughDay) };
  });
  const previousDayCount = Math.min(
    dayCount,
    daysInMonth(Number(previousMonth.slice(0, 4)), Number(previousMonth.slice(5, 7))),
  );
  const previousDaily = Array.from({ length: previousDayCount }, (_, index) => {
    const date = addDays(`${previousMonth}-01`, index);
    const spent = previousTransactions
      .filter((row) => (row.date ?? "").slice(0, 10) === date)
      .reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);
    return { label: date.slice(8), value: spent };
  });

  return { monthly, daily, previousDaily };
}

export async function handleHomeTrendsApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== "/api/home-trends") return false;
  if (request.method !== "GET") throw new HttpError(405, "Method not allowed.");

  const { client, user } = await requireSession(request, response);
  const admin = createServiceSupabaseClient();
  const now = new Date();
  const url = new URL(request.url ?? pathname, "http://localhost");
  const requestedMonth = url.searchParams.get("month");
  const month = isMonthKey(requestedMonth) ? requestedMonth : currentMonthKey(now);
  const requestedToday = url.searchParams.get("today");
  const today = isDateString(requestedToday) && requestedToday.startsWith(`${month}-`)
    ? requestedToday
    : `${month}-${String(now.getUTCDate()).padStart(2, "0")}`;
  const dayCount = Math.min(
    Number(today.slice(8)),
    daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7))),
  );
  const months = Array.from({ length: 6 }, (_, index) => addMonths(month, index - 5));
  const previousMonth = addMonths(month, -1);

  const membersResult = await client.rpc("leaderboard_members");
  if (membersResult.error && membersResult.error.code !== "PGRST202") {
    throw supabaseFailure(membersResult.error);
  }
  const friendsConfigured = !membersResult.error;
  const members = (membersResult.data ?? []) as { id: string; name: string }[];
  const memberSeries: Awaited<ReturnType<typeof memberTrends>>[] = [];
  for (let start = 0; start < members.length; start += friendBatchSize) {
    memberSeries.push(...await Promise.all(
      members.slice(start, start + friendBatchSize).map((member) =>
        memberTrends(admin, member, months, month, dayCount),
      ),
    ));
  }

  // Recheck friendship and visibility before returning scores read with the service role.
  let visibleMembers = memberSeries;
  if (friendsConfigured) {
    const latestMembers = await client.rpc("leaderboard_members");
    if (latestMembers.error) throw supabaseFailure(latestMembers.error);
    const allowedMembers = new Set(((latestMembers.data ?? []) as { id: string }[]).map((member) => member.id));
    visibleMembers = memberSeries.filter((member) => allowedMembers.has(member.id));
  }

  const own = await ownTrends(client, admin, user.id, months, month, previousMonth, dayCount);
  response.setHeader("Cache-Control", "no-store");
  sendJson(response, 200, {
    month,
    ...own,
    friendsMonthly: visibleMembers.map(({ id, name, monthly }) => ({
      name,
      isYou: id === user.id,
      values: monthly,
    })),
    friendsDaily: visibleMembers.map(({ id, name, daily }) => ({
      name,
      isYou: id === user.id,
      values: daily,
    })),
  });
  return true;
}
