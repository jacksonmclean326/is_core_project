import {
  getTransactions,
  readSnapshot,
  saveSnapshot,
  type CustomCategory,
  type LinkedTransaction,
  type MonthSummary,
  type TransactionsResponse
} from "../api.js";
import {
  addMonths,
  currentMonthKey,
  monthRange,
  shortDateLabel,
  shortMonthName,
  type MonthKey
} from "../../shared/months.js";
import { showToast } from "../ui/ui.js";
import { money, state, totalSpent, transactions, type TrendMode } from "../state/state.js";

export type LoadResult = "linked" | "sample" | "stale" | "error";
let latestTransactionRequest = 0;
let lastHistory = 0;
let refreshPage: (result: LoadResult) => void = () => {};
let hasRealData = false;
let monthTransactions: LinkedTransaction[] = [];
let pageWantsUpdates = false;
let applyToMerchant = true;
let syncPolls = 0;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let lastWarning = "";
const maxSyncPolls = 40;
const syncPollMs = 2500;
const prefetched = new Set<string>();

export let viewingMonth: MonthKey = currentMonthKey();
export let monthlyHistory: MonthSummary[] = [];
/** Short names of the six months shown on the trend chart, ending with the viewed month. */
export const months: string[] = monthRange(currentMonthKey(), 6).map(shortMonthName);

function applyResult(month: MonthKey, result: TransactionsResponse): LoadResult {
  viewingMonth = month;
  syncCustomCategories(result.customCategories ?? []);
  hasRealData = result.connected;
  monthTransactions = result.connected ? result.transactions : [];
  if (!result.connected) return "sample";

  const totals = new Map<string, number>();
  for (const category of state.categories) {
    transactions[category.id] = [];
    totals.set(category.id, 0);
  }
  for (const item of result.transactions) {
    const id = totals.has(item.category) ? item.category : "other";
    totals.set(id, (totals.get(id) ?? 0) + item.amount);
    transactions[id]?.push([item.name, money(item.amount), `${shortDateLabel(item.date)} · ${item.account}`, item.id]);
  }
  for (const category of state.categories) category.amount = Math.round(totals.get(category.id) ?? 0);
  if (result.history) {
    monthlyHistory = result.history;
    months.splice(0, months.length, ...result.history.map((entry) => shortMonthName(entry.month)));
  }
  return "linked";
}

/** Draws the last response seen in this tab while the network request completes. */
export function primeFromSnapshot(month: MonthKey, history = 0): "linked" | "none" {
  const snapshot = readSnapshot(month, history);
  if (!snapshot?.connected) return "none";
  lastHistory = history;
  return applyResult(month, snapshot) === "linked" ? "linked" : "none";
}

function scheduleSyncPoll(): void {
  clearTimeout(pollTimer);
  if (!pageWantsUpdates || syncPolls >= maxSyncPolls) return;
  syncPolls += 1;
  pollTimer = setTimeout(() => {
    if (document.visibilityState === "hidden") return scheduleSyncPoll();
    void reloadViewedMonth();
  }, syncPollMs);
}

/** Replaces sample spending with saved bank and manual transactions for one month. */
export async function loadLinkedTransactions(
  month: MonthKey = currentMonthKey(),
  history = 0
): Promise<LoadResult> {
  const requestId = ++latestTransactionRequest;
  lastHistory = history;
  try {
    const result = await getTransactions(month, history);
    if (requestId !== latestTransactionRequest) return "stale";
    const outcome = applyResult(month, result);
    if (outcome === "linked") saveSnapshot(month, history, result);
    if (result.warning && result.warning !== lastWarning) showToast(result.warning);
    lastWarning = result.warning ?? "";
    if (result.syncing) scheduleSyncPoll();
    else {
      syncPolls = 0;
      clearTimeout(pollTimer);
    }
    return outcome;
  } catch {
    return requestId === latestTransactionRequest ? "error" : "stale";
  }
}

/** Quietly fetches a month into this tab's snapshots so it opens quickly later. */
export function prefetchMonth(month: MonthKey): void {
  if (prefetched.has(month)) return;
  prefetched.add(month);
  void getTransactions(month, 0)
    .then((result) => {
      if (result.connected) saveSnapshot(month, 0, result);
    })
    .catch(() => prefetched.delete(month));
}

export function getMonthTransactions(): LinkedTransaction[] {
  return monthTransactions;
}

export function getManualTransaction(id: string): LinkedTransaction | undefined {
  return monthTransactions.find((transaction) => transaction.id === id && transaction.manual);
}

export function usingRealData(): boolean {
  return hasRealData;
}

export function movesWholeMerchant(): boolean {
  return applyToMerchant;
}

export function setMovesWholeMerchant(value: boolean): void {
  applyToMerchant = value;
}

export function syncCustomCategories(list: CustomCategory[]): void {
  const keys = new Set(list.map((category) => category.key));
  state.categories = state.categories.filter((category) => !category.custom || keys.has(category.id));
  for (const custom of list) {
    const existing = state.categories.find((category) => category.id === custom.key);
    if (existing) {
      existing.name = custom.name;
      existing.color = custom.color;
      existing.custom = true;
    } else {
      state.categories.push({ id: custom.key, name: custom.name, amount: 0, limit: 0, color: custom.color, visible: true, custom: true });
    }
  }
}

export function onDataChanged(handler: (result: LoadResult) => void): void {
  refreshPage = handler;
  pageWantsUpdates = true;
}

export async function reloadViewedMonth(): Promise<LoadResult> {
  const result = await loadLinkedTransactions(viewingMonth, lastHistory);
  if (result !== "stale") refreshPage(result);
  return result;
}

export function redrawDataPage(): void {
  refreshPage(hasRealData ? "linked" : "sample");
}

export function trendValues(mode: TrendMode): number[] {
  const budget = Number(state.budget) || 0;
  if (!monthlyHistory.length) {
    const fallback = {
      spending: [1920, 1880, 2050, 1800, 1890, 1740],
      under: [13, 18, 7, 15, 14, 21],
      saved: [240, 290, 190, 330, 310, 460]
    }[mode];
    const values = [...fallback];
    const spent = totalSpent();
    if (mode === "spending") values[values.length - 1] = spent;
    if (mode === "under") values[values.length - 1] = budget ? Math.max(0, Math.round(((budget - spent) / budget) * 100)) : 0;
    if (mode === "saved") values[values.length - 1] = budget ? Math.max(0, budget - spent) : 0;
    return values;
  }
  return monthlyHistory.map(({ total }) => {
    if (mode === "spending") return Math.round(total);
    if (mode === "under") return budget ? Math.max(0, Math.round(((budget - total) / budget) * 100)) : 0;
    return budget ? Math.max(0, Math.round(budget - total)) : 0;
  });
}
