import type { IncomingMessage, ServerResponse } from "node:http";
import type { User } from "@supabase/supabase-js";
import { requireAdmin } from "../admin.js";
import { createServiceSupabaseClient, type SessionClient } from "../auth/supabase.js";
import { config } from "../config.js";
import { HttpError, supabaseFailure } from "../errors.js";
import { sendJson } from "../http/response.js";
import { checkInTable, isMissingTable, migrationMissing, recordGoalHistory, resultsTable } from "../savings-history.js";
import { monthStart, utcDateString, type MonthKey } from "../../shared/months.js";
import {
  checkInAfterDays,
  consistencyNeeded,
  consistencyWindow,
  daysSince,
  finishedMonths,
  isCheckInDue,
  percent,
  userConsistency,
} from "../../shared/savings-okrs.js";

/** The team-only OKR numbers behind /admin. Only admins (see ../admin.ts) can use it, and it needs SUPABASE_SECRET_KEY. */

const pageSize = 1000;

async function allUsers(admin: SessionClient): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; page < 100; page++) {
    const result = await admin.auth.admin.listUsers({ page, perPage: pageSize });
    if (result.error) throw supabaseFailure(result.error);
    users.push(...result.data.users);
    if (result.data.users.length < pageSize) break;
  }
  return users;
}

async function allRows<T>(admin: SessionClient, table: string, columns: string, since?: { column: string; value: string }): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    let query = admin.from(table).select(columns);
    if (since) query = query.gte(since.column, since.value);
    const result = await query.range(offset, offset + pageSize - 1).returns<T[]>();
    if (result.error) {
      if (isMissingTable(result.error, table)) throw migrationMissing();
      throw supabaseFailure(result.error);
    }
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < pageSize) break;
  }
  return rows;
}

/** Runs `work` for every user, four at a time. Returns how many failed. */
async function forEachUser(users: User[], work: (user: User) => Promise<unknown>): Promise<{ failed: number; written: number }> {
  let failed = 0;
  let written = 0;
  for (let offset = 0; offset < users.length; offset += 4) {
    const settled = await Promise.allSettled(users.slice(offset, offset + 4).map(work));
    for (const outcome of settled) {
      if (outcome.status === "fulfilled") written += typeof outcome.value === "number" ? outcome.value : 0;
      else {
        if (outcome.reason instanceof HttpError && outcome.reason.status === 503) throw outcome.reason;
        failed++;
        console.error("Savings OKR history failed for a user.", outcome.reason);
      }
    }
  }
  return { failed, written };
}

function displayName(user: User): string {
  const meta = user.user_metadata ?? {};
  const name = [meta.first_name, meta.last_name].filter((part) => typeof part === "string" && part.trim()).join(" ");
  return name || (typeof meta.full_name === "string" ? meta.full_name : "") || user.email || "Unknown user";
}

interface ResultRow {
  user_id: string;
  month: string;
  met: boolean;
  goals_met: number;
  goals_counted: number;
}

interface CheckInRow {
  user_id: string;
  saved: boolean | null;
  amount: number | null;
  answered_at: string | null;
  snoozed_until: string | null;
}

async function okrReport(admin: SessionClient, users: User[], failedUsers: number) {
  const now = new Date();
  const current: MonthKey = utcDateString(now).slice(0, 7);
  const months = finishedMonths(current, consistencyWindow);
  const [results, checkIns] = await Promise.all([
    allRows<ResultRow>(admin, resultsTable, "user_id,month,met,goals_met,goals_counted", {
      column: "month",
      value: monthStart(months[months.length - 1]),
    }),
    allRows<CheckInRow>(admin, checkInTable, "user_id,saved,amount,answered_at,snoozed_until"),
  ]);

  const resultsByUser = new Map<string, Map<MonthKey, ResultRow>>();
  for (const row of results) {
    const byMonth = resultsByUser.get(row.user_id) ?? new Map<MonthKey, ResultRow>();
    byMonth.set(row.month.slice(0, 7), row);
    resultsByUser.set(row.user_id, byMonth);
  }
  const checkInByUser = new Map(checkIns.map((row) => [row.user_id, row]));

  let goalUsers = 0;
  let consistentUsers = 0;
  let eligibleForCheckIn = 0;
  let eligibleAnswered = 0;
  let answered = 0;
  let reportedSavings = 0;

  const people = users.map((user) => {
    const byMonth = resultsByUser.get(user.id) ?? new Map<MonthKey, ResultRow>();
    const consistency = userConsistency(new Map([...byMonth].map(([month, row]) => [month, row.met])), current);
    if (consistency.tracked > 0) {
      goalUsers++;
      if (consistency.consistent) consistentUsers++;
    }

    const checkIn = checkInByUser.get(user.id) ?? null;
    const days = daysSince(user.created_at, now);
    const hasAnswer = checkIn?.saved === true || checkIn?.saved === false;
    if (hasAnswer) {
      answered++;
      if (checkIn?.saved) reportedSavings++;
    }
    if (days >= checkInAfterDays) {
      eligibleForCheckIn++;
      if (hasAnswer) eligibleAnswered++;
    }
    let checkInStatus: "yes" | "no" | "snoozed" | "due" | "waiting";
    if (checkIn?.saved === true) checkInStatus = "yes";
    else if (checkIn?.saved === false) checkInStatus = "no";
    else if (isCheckInDue(user.created_at, checkIn ? { saved: null, snoozedUntil: checkIn.snoozed_until } : null, now)) checkInStatus = "due";
    else if (days >= checkInAfterDays) checkInStatus = "snoozed";
    else checkInStatus = "waiting";

    return {
      name: displayName(user),
      email: user.email ?? null,
      signedUpAt: user.created_at,
      daysSinceSignUp: days,
      months: months.map((month) => {
        const row = byMonth.get(month);
        return row ? { month, met: row.met, goalsMet: row.goals_met, goalsCounted: row.goals_counted } : { month, met: null, goalsMet: 0, goalsCounted: 0 };
      }),
      monthsTracked: consistency.tracked,
      monthsMet: consistency.met,
      consistent: consistency.tracked > 0 ? consistency.consistent : null,
      checkIn: checkInStatus,
      savedAmount: checkIn?.saved ? (checkIn.amount ?? null) : null,
    };
  });

  return {
    generatedAt: now.toISOString(),
    totalUsers: users.length,
    failedUsers,
    months,
    okr3: {
      consistentUsers,
      goalUsers,
      percent: percent(consistentUsers, goalUsers),
      rule: `Met every Savings and Spending goal in at least ${consistencyNeeded} of the last ${consistencyWindow} finished months.`,
    },
    okr4: {
      reportedSavings,
      answered,
      percent: percent(reportedSavings, answered),
      eligible: eligibleForCheckIn,
      eligibleAnswered,
      responseRate: percent(eligibleAnswered, eligibleForCheckIn),
      rule: `Answered "Yes" to the savings check-in shown ${checkInAfterDays} days after sign-up.`,
    },
    people: people.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function handleAdminApi(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
  if (pathname !== "/api/admin/okrs") return false;
  if (request.method !== "GET") throw new HttpError(405, "Method not allowed.");
  await requireAdmin(request, response);
  if (!config.supabaseSecretKey) throw new HttpError(503, "The OKR page needs SUPABASE_SECRET_KEY on the server.");

  const admin = createServiceSupabaseClient();
  const users = await allUsers(admin);
  // Work every user's months out again from their current transactions, income and goals, so the Key Results
  // follow what people actually do: a new transaction, a changed goal or a fixed income shows up on the next load.
  const { failed, written } = await forEachUser(users, (user) => recordGoalHistory(admin, user.id, { recompute: true }));
  const report = await okrReport(admin, users, failed);
  response.setHeader("Cache-Control", "no-store");
  sendJson(response, 200, { ...report, monthsWritten: written });
  return true;
}
