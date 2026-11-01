import { createServiceSupabaseClient } from "./auth/supabase.js";
import { supabaseFailure } from "./errors.js";
import { categoryIds, type CategoryId, type CategoryOverrides } from "./categorize.js";

export interface CustomCategory {
  key: string;
  name: string;
  color: string;
}

type Admin = ReturnType<typeof createServiceSupabaseClient>;

export async function listCustomCategories(admin: Admin, userId: string): Promise<CustomCategory[]> {
  const result = await admin
    .from("Custom Category")
    .select("category_key,name,color,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .returns<{ category_key: string; name: string; color: string }[]>();
  if (result.error) throw supabaseFailure(result.error);
  return (result.data ?? []).map((row) => ({ key: row.category_key, name: row.name, color: row.color }));
}

/** The user's own choices (custom categories, merchant rules, manual picks) for a set of transactions. */
export async function loadOverrides(admin: Admin, userId: string): Promise<{
  overrides: CategoryOverrides;
  customCategories: CustomCategory[];
}> {
  // Three independent lookups: run them together instead of one round trip after another.
  const [customCategories, rules, manual] = await Promise.all([
    listCustomCategories(admin, userId),
    admin
      .from("Merchant Rule")
      .select("merchant_key,category_key")
      .eq("user_id", userId)
      .returns<{ merchant_key: string; category_key: string }[]>(),
    admin
      .from("Transaction")
      .select("plaid_transaction_id,category_key")
      .eq("user_id", userId)
      .eq("category_manual", true)
      .returns<{ plaid_transaction_id: string | null; category_key: string | null }[]>(),
  ]);
  const validKeys = new Set<CategoryId>([...categoryIds, ...customCategories.map((category) => category.key)]);
  if (rules.error) throw supabaseFailure(rules.error);
  if (manual.error) throw supabaseFailure(manual.error);

  return {
    customCategories,
    overrides: {
      validKeys,
      merchantRules: new Map((rules.data ?? []).map((row) => [row.merchant_key, row.category_key])),
      manual: new Map(
        (manual.data ?? [])
          .filter((row) => row.plaid_transaction_id && row.category_key)
          .map((row) => [row.plaid_transaction_id as string, row.category_key as string]),
      ),
    },
  };
}
