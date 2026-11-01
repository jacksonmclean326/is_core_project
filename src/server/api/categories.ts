import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServiceSupabaseClient } from "../auth/supabase.js";
import { requireSession } from "../auth/session.js";
import { config } from "../config.js";
import { HttpError, supabaseFailure } from "../errors.js";
import { readJsonBody } from "../http/request-body.js";
import { sendJson } from "../http/response.js";
import { settleUserSyncs } from "../plaid/sync.js";
import { listCustomCategories, type CustomCategory } from "../category-store.js";

export { listCustomCategories, loadOverrides, type CustomCategory } from "../category-store.js";
import {
  categoryIds,
  isBuiltInCategory,
  isCategoryKey,
  normalizeMerchant,
  type CategoryId,
  type CategoryOverrides,
} from "../categorize.js";

export const maxCustomCategories = 12;
export const maxCategoryNameLength = 24;
const customColors = [
  "#c0504d", "#4f81bd", "#8064a2", "#4bacc6", "#f79646", "#9bbb59",
  "#7f7f7f", "#2c4d75", "#b65708", "#6b8e23", "#8b4789", "#2e8b8b",
];
// Default names of the built-in categories: custom names may not collide with them.
const builtInNames = ["housing", "food", "transport", "utilities", "education", "personal", "other"];

type Admin = ReturnType<typeof createServiceSupabaseClient>;

/** Trims and validates a category name; returns the clean name. */
export function cleanCategoryName(value: unknown): string {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!name) throw new HttpError(400, "Give the category a name.");
  if (name.length > maxCategoryNameLength) {
    throw new HttpError(400, `Category names can be at most ${maxCategoryNameLength} characters.`);
  }
  if (/[<>]/.test(name)) throw new HttpError(400, "Category names cannot contain < or >.");
  return name;
}

function nameTaken(name: string, existing: CustomCategory[], ignoreKey?: string): boolean {
  const wanted = name.toLowerCase();
  return (
    builtInNames.includes(wanted) ||
    existing.some((category) => category.key !== ignoreKey && category.name.toLowerCase() === wanted)
  );
}

export function nextCustomColor(existing: CustomCategory[]): string {
  const used = new Set(existing.map((category) => category.color));
  return customColors.find((color) => !used.has(color)) ?? customColors[existing.length % customColors.length]!;
}

function requireStorage(): void {
  if (!config.supabaseSecretKey) {
    throw new HttpError(503, "Category storage is not configured. Set SUPABASE_SECRET_KEY on the server.");
  }
}

async function assertAssignable(admin: Admin, userId: string, category: unknown): Promise<CategoryId> {
  if (!isCategoryKey(category)) throw new HttpError(400, "Choose a valid category.");
  if (isBuiltInCategory(category)) return category;
  const owned = (await listCustomCategories(admin, userId)).some((item) => item.key === category);
  if (!owned) throw new HttpError(400, "That category does not exist.");
  return category;
}

async function recategorize(admin: Admin, userId: string, body: Record<string, unknown>): Promise<{ moved: number }> {
  const transactionId = typeof body.transactionId === "string" ? body.transactionId.trim() : "";
  if (!transactionId || transactionId.length > 200) throw new HttpError(400, "Choose a transaction.");
  const category = await assertAssignable(admin, userId, body.category);
  const applyToMerchant = body.applyToMerchant === true;
  // A sync that is mid-flight could write over this choice, so let it finish first.
  await settleUserSyncs(userId);

  const found = await admin
    .from("Transaction")
    .select("transaction_id,name")
    .eq("user_id", userId)
    .eq("plaid_transaction_id", transactionId)
    .maybeSingle<{ transaction_id: string; name: string | null }>();
  if (found.error) throw supabaseFailure(found.error);
  if (!found.data) throw new HttpError(404, "That transaction was not found. Reload the page and try again.");

  const updated = await admin
    .from("Transaction")
    .update({ category_key: category, category_manual: true })
    .eq("transaction_id", found.data.transaction_id)
    .eq("user_id", userId);
  if (updated.error) throw supabaseFailure(updated.error);
  let moved = 1;

  const merchant = normalizeMerchant(found.data.name ?? "");
  if (applyToMerchant && merchant) {
    const saved = await admin
      .from("Merchant Rule")
      .upsert({ user_id: userId, merchant_key: merchant, category_key: category }, { onConflict: "user_id,merchant_key" });
    if (saved.error) throw supabaseFailure(saved.error);

    const rows = await admin
      .from("Transaction")
      .select("transaction_id,name")
      .eq("user_id", userId)
      .not("plaid_transaction_id", "is", null)
      .neq("transaction_id", found.data.transaction_id)
      .returns<{ transaction_id: string; name: string | null }[]>();
    if (rows.error) throw supabaseFailure(rows.error);
    const siblingIds = (rows.data ?? [])
      .filter((row) => normalizeMerchant(row.name ?? "") === merchant)
      .map((row) => row.transaction_id);
    for (let start = 0; start < siblingIds.length; start += 100) {
      const chunk = siblingIds.slice(start, start + 100);
      const siblings = await admin
        .from("Transaction")
        .update({ category_key: category, category_manual: false })
        .in("transaction_id", chunk)
        .eq("user_id", userId);
      if (siblings.error) throw supabaseFailure(siblings.error);
    }
    moved += siblingIds.length;
  }
  return { moved };
}

export async function handleCategoriesApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === "/api/categories" && request.method === "GET") {
    const { user } = await requireSession(request, response);
    requireStorage();
    sendJson(response, 200, { categories: await listCustomCategories(createServiceSupabaseClient(), user.id) });
    return true;
  }

  if (pathname === "/api/categories" && request.method === "POST") {
    const { user } = await requireSession(request, response);
    requireStorage();
    const admin = createServiceSupabaseClient();
    const name = cleanCategoryName((await readJsonBody(request)).name);
    const existing = await listCustomCategories(admin, user.id);
    if (existing.length >= maxCustomCategories) {
      throw new HttpError(400, `You can add up to ${maxCustomCategories} custom categories.`);
    }
    if (nameTaken(name, existing)) throw new HttpError(409, "You already have a category with that name.");
    const category: CustomCategory = {
      key: `c-${randomBytes(4).toString("hex")}`,
      name,
      color: nextCustomColor(existing),
    };
    const inserted = await admin
      .from("Custom Category")
      .insert({ user_id: user.id, category_key: category.key, name: category.name, color: category.color });
    if (inserted.error) throw supabaseFailure(inserted.error);
    sendJson(response, 201, { category });
    return true;
  }

  const match = pathname.match(/^\/api\/categories\/(c-[0-9a-f]{8})$/);
  if (match && request.method === "PATCH") {
    const { user } = await requireSession(request, response);
    requireStorage();
    const admin = createServiceSupabaseClient();
    const key = match[1] as string;
    const name = cleanCategoryName((await readJsonBody(request)).name);
    const existing = await listCustomCategories(admin, user.id);
    const current = existing.find((category) => category.key === key);
    if (!current) throw new HttpError(404, "That category was not found.");
    if (nameTaken(name, existing, key)) throw new HttpError(409, "You already have a category with that name.");
    const updated = await admin.from("Custom Category").update({ name }).eq("user_id", user.id).eq("category_key", key);
    if (updated.error) throw supabaseFailure(updated.error);
    sendJson(response, 200, { category: { ...current, name } });
    return true;
  }

  if (match && request.method === "DELETE") {
    const { user } = await requireSession(request, response);
    requireStorage();
    const admin = createServiceSupabaseClient();
    const key = match[1] as string;
    const existing = await listCustomCategories(admin, user.id);
    if (!existing.some((category) => category.key === key)) throw new HttpError(404, "That category was not found.");
    // Its transactions fall back to "Other" rather than disappearing.
    const moved = await admin
      .from("Transaction")
      .update({ category_key: "other" })
      .eq("user_id", user.id)
      .eq("category_key", key);
    if (moved.error) throw supabaseFailure(moved.error);
    const rules = await admin.from("Merchant Rule").delete().eq("user_id", user.id).eq("category_key", key);
    if (rules.error) throw supabaseFailure(rules.error);
    const removed = await admin.from("Custom Category").delete().eq("user_id", user.id).eq("category_key", key);
    if (removed.error) throw supabaseFailure(removed.error);
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (pathname === "/api/transactions/category" && request.method === "PUT") {
    const { user } = await requireSession(request, response);
    requireStorage();
    sendJson(response, 200, await recategorize(createServiceSupabaseClient(), user.id, await readJsonBody(request)));
    return true;
  }

  return false;
}
