import type { Transaction } from "plaid";
import { createServiceSupabaseClient } from "../auth/supabase.js";
import { categorizerVersion } from "../categorize.js";
import { loadOverrides } from "../category-store.js";
import { supabaseFailure } from "../errors.js";
import { createPlaidClient, decryptPlaidAccessToken, logPlaidFailure } from "./client.js";
import { plaidErrorCode, toStoredTransactions } from "./convert.js";

/**
 * Keeps each bank's transactions up to date in our own database, using Plaid's incremental sync:
 * after the first pass, Plaid only sends what changed since the last one. Pages read the database
 * (fast); this runs in the background.
 */

/** How long saved transactions are trusted before checking Plaid again. */
export const staleAfterMs = 5 * 60 * 1000;
/** While Plaid is still importing older months, check again this often. */
export const historyPollMs = 15 * 1000;
/** Never ask Plaid about the same bank more often than this (protects against error loops). */
const minGapMs = 5 * 1000;
const pageSize = 500;

export interface SyncItem {
  item_id: string;
  user_id: string;
  institution_name: string;
  access_token_encrypted: string;
  transactions_cursor: string | null;
  transactions_synced_at: string | null;
  history_complete: boolean;
  categorizer_version: number;
}

export const syncColumns =
  "item_id,user_id,institution_name,access_token_encrypted,transactions_cursor,transactions_synced_at,history_complete,categorizer_version";

type Admin = ReturnType<typeof createServiceSupabaseClient>;

/** Does this bank's data need refreshing from Plaid? */
export function needsSync(item: SyncItem, now: number): boolean {
  if (item.categorizer_version !== categorizerVersion) return true; // rules changed: re-sort everything
  if (!item.transactions_synced_at) return true;
  const synced = Date.parse(item.transactions_synced_at);
  if (!Number.isFinite(synced)) return true;
  return now - synced > (item.history_complete ? staleAfterMs : historyPollMs);
}

/** Ids of saved rows to delete after a sync: removed by Plaid, or changed into something that is not spending. */
export function idsToDelete(removed: string[], touched: string[], kept: Set<string>): string[] {
  return [...new Set([...removed, ...touched.filter((id) => !kept.has(id))])];
}

const running = new Map<string, { userId: string; promise: Promise<void> }>();
const lastAttempt = new Map<string, number>();
const failing = new Set<string>();

export function isSyncing(itemId: string): boolean {
  return running.has(itemId);
}

export function lastSyncFailed(itemId: string): boolean {
  return failing.has(itemId);
}

/** Waits for any sync in progress for this user (so a change they make is not overwritten). */
export async function settleUserSyncs(userId: string): Promise<void> {
  await Promise.all([...running.values()].filter((entry) => entry.userId === userId).map((entry) => entry.promise));
}

/** Starts a sync for one bank unless one is already running. Never throws. */
export function startSync(item: SyncItem, options: { force?: boolean } = {}): Promise<void> {
  const existing = running.get(item.item_id);
  if (existing) return existing.promise;
  const last = lastAttempt.get(item.item_id) ?? 0;
  if (!options.force && Date.now() - last < minGapMs) return Promise.resolve();
  lastAttempt.set(item.item_id, Date.now());

  const promise: Promise<void> = runSync(item)
    .then(() => {
      failing.delete(item.item_id);
    })
    .catch((error: unknown) => {
      failing.add(item.item_id);
      logPlaidFailure(error, "transactions/sync");
      console.error("Transaction sync failed.", error instanceof Error ? error.message : "");
    })
    .finally(() => {
      running.delete(item.item_id);
    });
  running.set(item.item_id, { userId: item.user_id, promise });
  return promise;
}

/** Loads a bank connection by id and starts syncing it (used right after a bank is linked). */
export async function startSyncForItem(itemId: string): Promise<void> {
  try {
    const admin = createServiceSupabaseClient();
    const result = await admin.from("Plaid Item").select(syncColumns).eq("item_id", itemId).maybeSingle<SyncItem>();
    if (result.error || !result.data) return;
    await startSync(result.data, { force: true });
  } catch (error) {
    console.error("Could not start the first sync.", error instanceof Error ? error.message : "");
  }
}

interface Pulled {
  added: Transaction[];
  modified: Transaction[];
  removed: string[];
  accounts: { account_id: string; name: string }[];
  cursor: string;
  status: string;
}

async function pullChanges(item: SyncItem, startCursor: string | null): Promise<Pulled | null> {
  const plaid = createPlaidClient();
  const accessToken = decryptPlaidAccessToken(item.access_token_encrypted);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const pulled: Pulled = { added: [], modified: [], removed: [], accounts: [], cursor: startCursor ?? "", status: "" };
    let cursor = startCursor;
    try {
      for (;;) {
        const response = await plaid.transactionsSync({
          access_token: accessToken,
          cursor: cursor ?? undefined,
          count: pageSize,
          options: { include_personal_finance_category: true },
        });
        const data = response.data;
        pulled.added.push(...data.added);
        pulled.modified.push(...data.modified);
        pulled.removed.push(...data.removed.map((row) => row.transaction_id));
        pulled.accounts = data.accounts.map((account) => ({ account_id: account.account_id, name: account.name }));
        pulled.status = data.transactions_update_status;
        cursor = data.next_cursor;
        pulled.cursor = data.next_cursor;
        if (!data.has_more) return pulled;
      }
    } catch (error) {
      const code = plaidErrorCode(error);
      if (code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") continue; // data changed mid-read: start over
      if (code === "PRODUCT_NOT_READY") return null; // Plaid is still preparing the first batch
      throw error;
    }
  }
  throw new Error("Plaid kept changing the data while it was being read.");
}

async function runSync(item: SyncItem): Promise<void> {
  const admin = createServiceSupabaseClient();
  // A change in the sorting rules means every saved transaction is re-sorted from scratch.
  const startCursor = item.categorizer_version === categorizerVersion ? item.transactions_cursor : null;
  const fullPass = startCursor === null;

  const pulled = await pullChanges(item, startCursor);
  if (!pulled || pulled.status === "NOT_READY") return; // try again on the next page load

  const [{ overrides }, sourcesResult] = await Promise.all([
    loadOverrides(admin, item.user_id),
    admin
      .from("Income Source")
      .select("source_id,plaid_account_id,account_name")
      .eq("user_id", item.user_id)
      .eq("plaid_connection_id", item.item_id)
      .returns<{ source_id: string; plaid_account_id: string | null; account_name: string | null }[]>(),
  ]);
  if (sourcesResult.error) throw supabaseFailure(sourcesResult.error);
  const sources = sourcesResult.data ?? [];
  const sourceByAccount = new Map(sources.filter((s) => s.plaid_account_id).map((s) => [s.plaid_account_id as string, s.source_id]));
  const accounts = [
    ...pulled.accounts,
    ...sources
      .filter((s) => s.plaid_account_id && s.account_name && !pulled.accounts.some((a) => a.account_id === s.plaid_account_id))
      .map((s) => ({ account_id: s.plaid_account_id as string, name: s.account_name as string })),
  ];

  const touched = [...pulled.added, ...pulled.modified];
  const kept = toStoredTransactions(touched, accounts, item.institution_name, overrides);
  const keptIds = new Set(kept.map((row) => row.id));
  const rows = kept.map((row) => ({
    user_id: item.user_id,
    plaid_transaction_id: row.id,
    name: row.name,
    amount: row.amount,
    date: `${row.date}T00:00:00Z`,
    category_key: row.category,
    account_name: row.account,
    institution_name: row.institution,
    source_id: sourceByAccount.get(row.accountId) ?? null,
  }));
  const deletes = idsToDelete(pulled.removed, touched.map((t) => t.transaction_id), keptIds);

  const writes: PromiseLike<unknown>[] = [];
  for (let start = 0; start < rows.length; start += 500) {
    writes.push(
      admin
        .from("Transaction")
        .upsert(rows.slice(start, start + 500), { onConflict: "user_id,plaid_transaction_id" })
        .then((result) => {
          if (result.error) throw supabaseFailure(result.error);
        }),
    );
  }
  for (let start = 0; start < deletes.length; start += 100) {
    writes.push(
      admin
        .from("Transaction")
        .delete()
        .eq("user_id", item.user_id)
        .in("plaid_transaction_id", deletes.slice(start, start + 100))
        .then((result) => {
          if (result.error) throw supabaseFailure(result.error);
        }),
    );
  }
  await Promise.all(writes);

  // After a from-scratch pass, anything saved for this bank that Plaid no longer returns is stale.
  if (fullPass && sources.length) {
    const sourceIds = sources.map((s) => s.source_id);
    const stale: string[] = [];
    for (let from = 0; ; from += 1000) {
      const page = await admin
        .from("Transaction")
        .select("transaction_id,plaid_transaction_id")
        .eq("user_id", item.user_id)
        .in("source_id", sourceIds)
        .not("plaid_transaction_id", "is", null)
        .order("transaction_id")
        .range(from, from + 999)
        .returns<{ transaction_id: string; plaid_transaction_id: string }[]>();
      if (page.error) throw supabaseFailure(page.error);
      for (const row of page.data ?? []) if (!keptIds.has(row.plaid_transaction_id)) stale.push(row.transaction_id);
      if ((page.data ?? []).length < 1000) break;
    }
    for (let start = 0; start < stale.length; start += 100) {
      const removed = await admin.from("Transaction").delete().in("transaction_id", stale.slice(start, start + 100));
      if (removed.error) throw supabaseFailure(removed.error);
    }
  }

  // Only now remember how far we got, so a failed save is retried from the same point.
  const done = await admin
    .from("Plaid Item")
    .update({
      transactions_cursor: pulled.cursor,
      transactions_synced_at: new Date().toISOString(),
      history_complete: pulled.status === "HISTORICAL_UPDATE_COMPLETE",
      categorizer_version: categorizerVersion,
    })
    .eq("item_id", item.item_id)
    .eq("user_id", item.user_id);
  if (done.error) throw supabaseFailure(done.error);
}
