import type { IncomingMessage, ServerResponse } from "node:http";
import { createServiceSupabaseClient } from "../auth/supabase.js";
import { requireSession } from "../auth/session.js";
import { config } from "../config.js";
import { HttpError, supabaseFailure } from "../errors.js";
import { readJsonBody } from "../http/request-body.js";
import { sendJson } from "../http/response.js";
import { isBuiltInCategory, isCategoryKey, type CategoryId } from "../categorize.js";
import {
  addDays,
  addMonths,
  compareMonths,
  isDateString,
  monthKeyOfDate,
  transactionHistoryMonths,
  utcDateString,
} from "../../shared/months.js";
import { listCustomCategories } from "./categories.js";
import type { PublicTransaction } from "./transactions.js";

export const maxManualTransactions = 2000;
export const maxNameLength = 60;
export const maxAmount = 1_000_000;

type Admin = ReturnType<typeof createServiceSupabaseClient>;

export interface ManualFields {
  name: string;
  amount: number;
  date: string;
  category: string;
}

function requireStorage(): void {
  if (!config.supabaseSecretKey) {
    throw new HttpError(503, "Transaction storage is not configured. Set SUPABASE_SECRET_KEY on the server.");
  }
}

/** A transaction may be dated up to tomorrow (UTC), so users whose clock is ahead are not rejected. */
export function dateAllowed(date: string, today: string): boolean {
  if (!isDateString(date)) return false;
  if (date > addDays(today, 1)) return false;
  const oldest = addMonths(monthKeyOfDate(today), -transactionHistoryMonths);
  return compareMonths(monthKeyOfDate(date), oldest) >= 0;
}

export function cleanDescription(value: unknown): string {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!name) throw new HttpError(400, "Enter a merchant or description.");
  if (name.length > maxNameLength) throw new HttpError(400, `Descriptions can be at most ${maxNameLength} characters.`);
  if (/[<>]/.test(name)) throw new HttpError(400, "Descriptions cannot contain < or >.");
  return name;
}

/** Returns the amount in dollars, rounded to cents. Manual entries record spending, so it must be positive. */
export function cleanAmount(value: unknown): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(number)) throw new HttpError(400, "Enter an amount, like 12.50.");
  const cents = Math.round(number * 100);
  if (cents <= 0) throw new HttpError(400, "The amount must be more than $0.");
  if (cents > maxAmount * 100) throw new HttpError(400, "That amount is too large.");
  return cents / 100;
}

export function cleanDate(value: unknown, today: string): string {
  if (typeof value !== "string" || !dateAllowed(value, today)) {
    throw new HttpError(400, `Choose a valid date within the last ${transactionHistoryMonths} months, no later than tomorrow.`);
  }
  return value;
}

async function assertCategory(admin: Admin, userId: string, category: unknown): Promise<CategoryId> {
  if (!isCategoryKey(category)) throw new HttpError(400, "Choose a valid category.");
  if (isBuiltInCategory(category)) return category;
  const owned = (await listCustomCategories(admin, userId)).some((item) => item.key === category);
  if (!owned) throw new HttpError(400, "That category does not exist.");
  return category;
}

interface ManualRow {
  transaction_id: string;
  name: string | null;
  amount: number | null;
  date: string | null;
  category_key: string | null;
}

export function toPublicManual(row: ManualRow, validKeys?: Set<string>): PublicTransaction & { manual: true } {
  const category = row.category_key && (!validKeys || validKeys.has(row.category_key)) ? row.category_key : "other";
  return {
    id: row.transaction_id,
    name: row.name ?? "Manual entry",
    amount: row.amount ?? 0,
    date: (row.date ?? "").slice(0, 10),
    category,
    account: "Manual entry",
    institution: "Manual",
    manual: true,
  };
}

/** Manual entries dated within [start, end] (inclusive). */
export async function listManualTransactions(
  admin: Admin,
  userId: string,
  start: string,
  end: string,
  validKeys?: Set<string>,
): Promise<(PublicTransaction & { manual: true })[]> {
  const result = await admin
    .from("Transaction")
    .select("transaction_id,name,amount,date,category_key")
    .eq("user_id", userId)
    .is("plaid_transaction_id", null)
    .gte("date", `${start}T00:00:00Z`)
    .lte("date", `${end}T23:59:59Z`)
    .returns<ManualRow[]>();
  if (result.error) throw supabaseFailure(result.error);
  return (result.data ?? []).map((row) => toPublicManual(row, validKeys));
}

export async function hasManualTransactions(admin: Admin, userId: string): Promise<boolean> {
  const result = await admin
    .from("Transaction")
    .select("transaction_id")
    .eq("user_id", userId)
    .is("plaid_transaction_id", null)
    .limit(1)
    .returns<{ transaction_id: string }[]>();
  if (result.error) throw supabaseFailure(result.error);
  return (result.data ?? []).length > 0;
}

export async function handleManualTransactionsApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  const today = utcDateString();

  if (pathname === "/api/transactions/manual" && request.method === "POST") {
    const { user } = await requireSession(request, response);
    requireStorage();
    const admin = createServiceSupabaseClient();
    const body = await readJsonBody(request);
    const fields: ManualFields = {
      name: cleanDescription(body.name),
      amount: cleanAmount(body.amount),
      date: cleanDate(body.date, today),
      category: await assertCategory(admin, user.id, body.category),
    };
    const existing = await admin
      .from("Transaction")
      .select("transaction_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("plaid_transaction_id", null);
    if (existing.error) throw supabaseFailure(existing.error);
    if ((existing.count ?? 0) >= maxManualTransactions) {
      throw new HttpError(400, `You can add up to ${maxManualTransactions} manual transactions.`);
    }
    const inserted = await admin
      .from("Transaction")
      .insert({
        user_id: user.id,
        name: fields.name,
        amount: fields.amount,
        date: `${fields.date}T00:00:00Z`,
        category_key: fields.category,
        account_name: "Manual entry",
        institution_name: "Manual",
        category_manual: false,
      })
      .select("transaction_id,name,amount,date,category_key")
      .single<ManualRow>();
    if (inserted.error) throw supabaseFailure(inserted.error);
    sendJson(response, 201, { transaction: toPublicManual(inserted.data) });
    return true;
  }

  const match = pathname.match(/^\/api\/transactions\/manual\/([0-9a-f-]{36})$/i);
  if (match && (request.method === "PATCH" || request.method === "DELETE")) {
    const { user } = await requireSession(request, response);
    requireStorage();
    const admin = createServiceSupabaseClient();
    const id = match[1] as string;

    const found = await admin
      .from("Transaction")
      .select("transaction_id,name,amount,date,category_key")
      .eq("transaction_id", id)
      .eq("user_id", user.id)
      .is("plaid_transaction_id", null)
      .maybeSingle<ManualRow>();
    if (found.error) throw supabaseFailure(found.error);
    if (!found.data) throw new HttpError(404, "That transaction was not found.");

    if (request.method === "DELETE") {
      const removed = await admin.from("Transaction").delete().eq("transaction_id", id).eq("user_id", user.id);
      if (removed.error) throw supabaseFailure(removed.error);
      sendJson(response, 200, { ok: true });
      return true;
    }

    const body = await readJsonBody(request);
    const changes: Record<string, unknown> = {};
    if (body.name !== undefined) changes.name = cleanDescription(body.name);
    if (body.amount !== undefined) changes.amount = cleanAmount(body.amount);
    if (body.date !== undefined) changes.date = `${cleanDate(body.date, today)}T00:00:00Z`;
    if (body.category !== undefined) changes.category_key = await assertCategory(admin, user.id, body.category);
    if (!Object.keys(changes).length) throw new HttpError(400, "Nothing to change.");
    const updated = await admin
      .from("Transaction")
      .update(changes)
      .eq("transaction_id", id)
      .eq("user_id", user.id)
      .select("transaction_id,name,amount,date,category_key")
      .single<ManualRow>();
    if (updated.error) throw supabaseFailure(updated.error);
    sendJson(response, 200, { transaction: toPublicManual(updated.data) });
    return true;
  }

  return false;
}
