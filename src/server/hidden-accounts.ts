import type { SessionClient } from "./auth/supabase.js";

/**
 * Accounts the person has hidden on the Accounts page. Their transactions stay in the database but are left out
 * of the list, the spending totals, goals and chat. If the `hidden` column has not been added yet (the bank
 * nickname migration has not been run), nothing is hidden.
 */
export async function hiddenSourceIds(admin: SessionClient, userId: string): Promise<string[]> {
  const result = await admin.from("Income Source").select("source_id").eq("user_id", userId).eq("hidden", true);
  if (result.error) return [];
  return (result.data ?? []).map((row) => String((row as { source_id: string }).source_id));
}

/**
 * Leaves out transactions that belong to hidden accounts. Manual transactions have no account, so a plain
 * "not in" would drop them too (SQL treats NULL as unknown); they are kept explicitly.
 */
export function withoutHidden<T extends { or(filters: string): T }>(query: T, hiddenIds: string[]): T {
  return hiddenIds.length ? query.or(`source_id.is.null,source_id.not.in.(${hiddenIds.join(",")})`) : query;
}
