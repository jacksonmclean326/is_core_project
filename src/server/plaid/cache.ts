import type { Transaction } from "plaid";

/**
 * A short-lived, in-memory copy of what Plaid returned for one bank connection.
 * Calling Plaid is the slowest part of loading transactions, so pages that ask again
 * within a few minutes (month switches, navigating between pages) reuse this copy.
 */
export interface CachedPull {
  /** first and last day the pull covers (YYYY-MM-DD) */
  start: string;
  end: string;
  fetchedAt: number;
  transactions: Transaction[];
  accounts: { account_id: string; name: string }[];
}

export const cacheTtlMs = 5 * 60 * 1000;
const maxEntries = 100;
const entries = new Map<string, CachedPull>();

/** The cached pull for a connection, if it is fresh and covers the whole requested range. */
export function readCache(itemId: string, start: string, end: string, now = Date.now()): CachedPull | undefined {
  const entry = entries.get(itemId);
  if (!entry) return undefined;
  if (now - entry.fetchedAt > cacheTtlMs) {
    entries.delete(itemId);
    return undefined;
  }
  return entry.start <= start && entry.end >= end ? entry : undefined;
}

export function writeCache(itemId: string, entry: CachedPull): void {
  entries.delete(itemId);
  entries.set(itemId, entry);
  while (entries.size > maxEntries) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/** Forget one connection (e.g. when it is disconnected), or everything. */
export function invalidateCache(itemId?: string): void {
  if (itemId === undefined) entries.clear();
  else entries.delete(itemId);
}

export function cacheSize(): number {
  return entries.size;
}
