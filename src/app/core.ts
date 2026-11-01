const palette = ["#2f6854", "#e7745a", "#537f9e", "#d5a33e", "#9b8cb4", "#a9bc9f", "#d9d5c7"];
import {
  createManualTransaction,
  deleteManualTransaction,
  getTransactions,
  recategorizeTransaction,
  updateManualTransaction,
  type CustomCategory,
  type LinkedTransaction,
  type MonthSummary
} from "./api.js";
import {
  addDays,
  addMonths,
  currentMonthKey,
  localDateString,
  monthEnd,
  monthName,
  monthRange,
  shortDateLabel,
  shortMonthName,
  transactionHistoryMonths,
  type MonthKey,
} from "../shared/months.js";

let latestTransactionRequest = 0;
let lastHistory = 0;
let refreshPage: (result: LoadResult) => void = () => {};
let hasRealData = false;
let openCategoryId: string | undefined;
/** Transactions the user typed in, keyed by id (cleared on every load). */
const manualEntries = new Map<string, LinkedTransaction>();
let applyToMerchant = true;
/** Month whose spending the pages are currently showing. */
export let viewingMonth: MonthKey = currentMonthKey();
/** Real per-month totals (oldest first) once a bank is linked; empty otherwise. */
export let monthlyHistory: MonthSummary[] = [];
const storageKey = "money-man-prototype";
const legacyStorageKey = "monarch-prototype";

export interface Category {
  id: string;
  name: string;
  amount: number;
  limit: number;
  color: string;
  visible: boolean;
  /** created by the user (stored in the database) rather than built in */
  custom?: boolean;
}

export interface Goal {
  id: string;
  kind: string;
  name: string;
  target: number;
  progress: number;
}

export interface Friend {
  id: string;
  name: string;
  initials: string;
  points: number;
  streak: number;
  color: string;
  code?: string;
  isYou?: boolean;
}

export interface AppState {
  budget: number | null;
  income: number;
  streak: number;
  friendSeedVersion: number;
  categories: Category[];
  goals: Goal[];
  friends: Friend[];
  accounts: { id: string; institution: string; detail: string; balance: number }[];
  preferences: { sync: boolean; reminders: boolean; leaderboard: boolean };
  profile: { name: string; email: string };
}

type TrendMode = "spending" | "under" | "saved";

const initialState: AppState = {
  budget: 2200,
  income: 3200,
  streak: 12,
  friendSeedVersion: 1,
  categories: [
    { id: "housing", name: "Housing", amount: 690, limit: 900, color: palette[0], visible: true },
    { id: "food", name: "Food", amount: 276, limit: 300, color: palette[1], visible: true },
    { id: "transport", name: "Transport", amount: 104, limit: 180, color: palette[2], visible: true },
    { id: "utilities", name: "Utilities", amount: 120, limit: 160, color: palette[3], visible: true },
    { id: "education", name: "Education", amount: 96, limit: 140, color: palette[4], visible: true },
    { id: "personal", name: "Personal", amount: 184, limit: 250, color: palette[5], visible: true },
    { id: "other", name: "Other", amount: 270, limit: 350, color: palette[6], visible: true }
  ],
  goals: [
    { id: "savings", kind: "Savings", name: "A little breathing room", target: 400, progress: 315 },
    { id: "spending", kind: "Spending", name: "Keep eating out in check", target: 120, progress: 84 },
    { id: "earnings", kind: "Earnings", name: "Weekend shift fund", target: 250, progress: 175 }
  ],
  friends: [
    { id: "alex", name: "Alex Lee", initials: "AL", points: 820, streak: 12, color: "sage" },
    { id: "casey", name: "Casey Nguyen", initials: "CN", points: 760, streak: 10, color: "coral" },
    { id: "morgan", name: "Morgan Shaw", initials: "MS", points: 710, streak: 8, color: "blue" },
    { id: "sam", name: "Sam Patel", initials: "SP", points: 650, streak: 6, color: "sage" },
    { id: "riley", name: "Riley Chen", initials: "RC", points: 590, streak: 4, color: "blue" }
  ],
  accounts: [],
  preferences: { sync: true, reminders: true, leaderboard: true },
  profile: { name: "", email: "" }
};

function loadState() {
  try {
    const savedValue = localStorage.getItem(storageKey) || localStorage.getItem(legacyStorageKey);
    const saved: unknown = JSON.parse(savedValue ?? "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return structuredClone(initialState);
    const savedState = saved as Partial<AppState> & Record<string, unknown>;
    delete savedState.friendCode;
    const savedFriends = Array.isArray(savedState.friends) ? savedState.friends : [];
    const sampleFriendIds = new Set(initialState.friends.map((friend) => friend.id));
    const friends = Number(savedState.friendSeedVersion) >= 1
      ? savedFriends
      : [
          ...initialState.friends.map((friend) => savedFriends.find((savedFriend) => savedFriend.id === friend.id) || friend),
          ...savedFriends.filter((friend) => !sampleFriendIds.has(friend.id))
        ];
    return {
      ...structuredClone(initialState),
      ...savedState,
      friendSeedVersion: 1,
      categories: [
        ...initialState.categories,
        ...(savedState.categories || []).filter((item) => item.custom && /^c-[0-9a-f]{8}$/.test(item.id))
      ].map((category) => ({
        ...category,
        ...(savedState.categories || []).find((item) => item.id === category.id),
        // Spending always comes from the selected month, never from a previous visit.
        amount: category.amount
      })),
      goals: Array.isArray(savedState.goals) ? savedState.goals : structuredClone(initialState.goals),
      friends,
      accounts: [],
      preferences: { ...initialState.preferences, ...savedState.preferences },
      profile: structuredClone(initialState.profile)
    };
  } catch {
    return structuredClone(initialState);
  }
}

export const state: AppState = loadState();
export const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
/** Short names of the six months shown on the trend chart, ending with the viewed month. */
export const months: string[] = monthRange(currentMonthKey(), 6).map(shortMonthName);
export const trends: Record<TrendMode, { values: number[]; caption: string; format: (value: number) => string }> = {
  spending: { values: [1920, 1880, 2050, 1800, 1890, 1740], caption: "spent this month", format: (value) => currency.format(value) },
  under: { values: [13, 18, 7, 15, 14, 21], caption: "under budget this month", format: (value) => `${value}%` },
  saved: { values: [240, 290, 190, 330, 310, 460], caption: "saved this month", format: (value) => currency.format(value) }
};
/** [name, amount, detail, id] - `id` is only present for real (linked) transactions. */
export const transactions: Record<string, [string, string, string?, string?][]> = {
  housing: [["Campus apartment", "$540"], ["Campus parking", "$90"], ["Renter's insurance", "$60"]],
  food: [["Green Market", "$74"], ["Cedar Cafe", "$48"], ["Grocery Co-op", "$154"]],
  transport: [["City transit pass", "$68"], ["Ride share", "$36"]],
  utilities: [["Electric company", "$74"], ["Internet", "$46"]],
  education: [["Campus bookstore", "$58"], ["Print services", "$38"]],
  personal: [["Corner pharmacy", "$43"], ["Clothing store", "$82"], ["Streaming", "$59"]],
  other: [["Coffee shop", "$32"], ["Campus event", "$48"], ["Other purchases", "$190"]]
};

export type LoadResult = "linked" | "sample" | "stale" | "error";

/**
 * Replaces the sample spending with real, auto-categorized Plaid transactions for one
 * calendar month (default: the current month). `history` also loads that many earlier
 * months for the trend chart. Sample data stays when no bank is linked.
 */
export async function loadLinkedTransactions(
  month: MonthKey = currentMonthKey(),
  history = 0
): Promise<LoadResult> {
  const requestId = ++latestTransactionRequest;
  lastHistory = history;
  try {
    const result = await getTransactions(month, history);
    if (requestId !== latestTransactionRequest) return "stale";
    viewingMonth = month;
    syncCustomCategories(result.customCategories ?? []);
    hasRealData = result.connected;
    manualEntries.clear();
    if (!result.connected) return "sample";
    const totals = new Map<string, number>();
    for (const category of state.categories) {
      transactions[category.id] = [];
      totals.set(category.id, 0);
    }
    for (const item of result.transactions) {
      if (item.manual) manualEntries.set(item.id, item);
      const id = totals.has(item.category) ? item.category : "other";
      totals.set(id, (totals.get(id) ?? 0) + item.amount);
      transactions[id]?.push([item.name, money(item.amount), `${shortDateLabel(item.date)} · ${item.account}`, item.id]);
    }
    for (const category of state.categories) category.amount = Math.round(totals.get(category.id) ?? 0);
    if (result.history) {
      monthlyHistory = result.history;
      months.splice(0, months.length, ...result.history.map((entry) => shortMonthName(entry.month)));
    }
    if (result.warning) showToast(result.warning);
    return "linked";
  } catch {
    return requestId === latestTransactionRequest ? "error" : "stale";
  }
}

/** Mirrors the user's custom categories (from the server) into the category list. */
export function syncCustomCategories(list: CustomCategory[]) {
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

/** Pages register how to redraw themselves after their data changes. */
export function onDataChanged(handler: (result: LoadResult) => void) {
  refreshPage = handler;
}

/** Reloads the month being viewed (e.g. after categories change) and redraws the page. */
export async function reloadViewedMonth(): Promise<LoadResult> {
  const result = await loadLinkedTransactions(viewingMonth, lastHistory);
  if (result !== "stale") refreshPage(result);
  return result;
}

/** Values for the home-page trend chart, one per entry in `months`. */
export function trendValues(mode: TrendMode): number[] {
  const budget = Number(state.budget) || 0;
  if (!monthlyHistory.length) {
    const values = [...trends[mode].values];
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

export const $ = <T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T => {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Required page element not found: ${selector}`);
  return element;
};
export const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] =>
  [...root.querySelectorAll<T>(selector)];
export const eventElement = (event: Event): Element | null =>
  event.target instanceof Element ? event.target : null;
export const totalSpent = () => state.categories.reduce((total, category) => total + Number(category.amount || 0), 0);
export const money = (amount: number) => currency.format(Math.abs(Number(amount) || 0));
export const escapeHTML = (value: unknown) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
export const refreshIcons = () => window.lucide?.createIcons();

document.querySelectorAll(".profile-button .profile-initials").forEach((element) => {
  element.textContent = state.profile.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?";
});

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string) {
  const toast = document.querySelector<HTMLElement>("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3400);
}

export function saveState() {
  const { accounts: _accounts, ...savedState } = state;
  const categories = savedState.categories.map(({ amount: _amount, ...category }) => category);
  localStorage.setItem(storageKey, JSON.stringify({ ...savedState, categories }));
}

export function updateCategoryBudgets(totalBudget: number) {
  const categories = state.categories.filter((category) => Number(category.limit) > 0);
  const currentTotal = categories.reduce((total, category) => total + Number(category.limit), 0);
  if (!currentTotal || !categories.length) return;
  let allocated = 0;
  categories.forEach((category, index) => {
    const limit = index === categories.length - 1
      ? totalBudget - allocated
      : Math.round(totalBudget * Number(category.limit) / currentTotal);
    category.limit = Math.max(0, limit);
    allocated += category.limit;
  });
}

export function checkCategoryWarnings() {
  if (!state.preferences.reminders) return;
  const nearLimit = state.categories.find((category) => category.limit && category.amount / category.limit >= 0.9);
  if (nearLimit) showToast(`${nearLimit.name} is at ${Math.round(nearLimit.amount / nearLimit.limit * 100)}% of its category budget.`);
}

export function openCategoryDetails(categoryId: string | undefined) {
  if (!categoryId) return;
  const category = state.categories.find((item) => item.id === categoryId);
  if (!category) return;
  const rows = transactions[categoryId] || [["Recent purchase", money(category.amount)]];
  openCategoryId = categoryId;
  const options = state.categories
    .map((item) => `<option value="${escapeHTML(item.id)}"${item.id === categoryId ? " selected" : ""}>${escapeHTML(item.name)}</option>`)
    .join("");
  const canMove = rows.some((row) => row[3] && !manualEntries.has(row[3]));
  const detailRows = rows.map(([name, amount, detail, id]) => `<div class="transaction-row"><span>${escapeHTML(name)}<small>${escapeHTML(detail || "Linked account")}</small></span>${id ? `<select class="recategorize-select" data-transaction-id="${escapeHTML(id)}" data-merchant="${escapeHTML(name)}" aria-label="Move ${escapeHTML(name)} to another category">${options}</select>` : ""}<span>${escapeHTML(amount)}</span>${id && manualEntries.has(id) ? `<span class="row-actions"><button type="button" class="row-action" data-edit-manual="${escapeHTML(id)}" aria-label="Edit ${escapeHTML(name)}">Edit</button><button type="button" class="row-action" data-delete-manual="${escapeHTML(id)}" aria-label="Delete ${escapeHTML(name)}">Delete</button></span>` : ""}</div>`).join("");
  const applyRow = canMove ? `<label class="apply-merchant"><input type="checkbox" id="apply-merchant"${applyToMerchant ? " checked" : ""}> Move all transactions from the same merchant, including future ones</label>` : "";
  const chartTotal = state.categories.filter((item) => item.visible).reduce((total, item) => total + Number(item.amount || 0), 0);
  const share = chartTotal ? category.amount / chartTotal * 100 : 0;
  const limit = Number(category.limit) || 0;
  const used = limit ? Math.min(100, category.amount / limit * 100) : 0;
  const isClose = limit > 0 && used >= 90;
  const status = limit ? (used >= 100 ? "Category limit reached" : isClose ? "Close to category limit" : "Within category budget") : "No category limit set";
  const average = rows.length ? category.amount / rows.length : category.amount;
  $("#dialog-content").innerHTML = `<p class="eyebrow">${monthName(viewingMonth).toUpperCase()} SPENDING</p><h2 class="dialog-title">${escapeHTML(category.name)}</h2><p class="dialog-subtitle">Category spending details</p><section class="category-detail-summary" aria-label="${escapeHTML(category.name)} spending summary"><p>Spent in ${monthName(viewingMonth)}</p><strong class="category-detail-amount">${money(category.amount)}</strong><span class="category-detail-limit">${limit ? `of ${money(limit)} monthly limit` : "No monthly limit"}</span><div class="category-detail-track"><span style="width:${used}%;background:${category.color}"></span></div><div class="category-detail-status${isClose ? " is-close" : ""}"><i data-lucide="${isClose ? "triangle-alert" : "circle-check"}" aria-hidden="true"></i><span>${status}</span></div><div class="category-detail-stats"><div><span>Share</span><strong>${share.toFixed(1)}%</strong></div><div><span>Purchases</span><strong>${rows.length}</strong></div><div><span>Average</span><strong>${money(average)}</strong></div></div></section><section class="category-detail-transactions"><h3>Transactions</h3>${applyRow}${detailRows || `<p class="watch-empty">No transactions in ${monthName(viewingMonth)}.</p>`}</section>`;
  $<HTMLDialogElement>("#detail-dialog").showModal();
  refreshIcons();
}

document.addEventListener("click", (event) => {
  const dialog = document.querySelector<HTMLDialogElement>("#detail-dialog");
  const target = event.target;
  if (dialog && (target === dialog || target instanceof Element && target.closest(".dialog-close"))) dialog.close();
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.id === "apply-merchant") {
    applyToMerchant = target.checked;
    return;
  }
  if (!(target instanceof HTMLSelectElement) || !target.classList.contains("recategorize-select")) return;
  const transactionId = target.dataset.transactionId;
  const merchant = target.dataset.merchant ?? "this transaction";
  if (!transactionId) return;
  const previous = [...target.options].find((option) => option.defaultSelected)?.value ?? "";
  const destination = state.categories.find((category) => category.id === target.value);
  target.disabled = true;
  const move = manualEntries.has(transactionId)
    ? updateManualTransaction(transactionId, { category: target.value }).then(() => ({ moved: 1 }))
    : recategorizeTransaction({ transactionId, category: target.value, applyToMerchant });
  move
    .then(async (result) => {
      await reloadViewedMonth();
      const detail = document.querySelector<HTMLDialogElement>("#detail-dialog");
      if (detail?.open && previous) openCategoryDetails(previous);
      showToast(
        result.moved > 1
          ? `Moved ${result.moved} ${merchant} transactions to ${destination?.name ?? "that category"}.`
          : `Moved ${merchant} to ${destination?.name ?? "that category"}.`
      );
    })
    .catch((error: unknown) => {
      target.value = previous;
      target.disabled = false;
      showToast(error instanceof Error ? error.message : "Could not move that transaction.");
    });
});

/** Short-lived state for the add/edit form. */
let editingManualId: string | undefined;

function defaultEntryDate(): string {
  const today = localDateString();
  return viewingMonth === currentMonthKey() ? today : monthEnd(viewingMonth);
}

/** Opens the add (or edit) transaction form in the shared dialog. */
export function openTransactionForm(existingId?: string, presetCategory?: string) {
  const existing = existingId ? manualEntries.get(existingId) : undefined;
  editingManualId = existing?.id;
  const category = existing?.category ?? presetCategory ?? state.categories.find((item) => item.visible)?.id ?? "other";
  const options = state.categories
    .map((item) => `<option value="${escapeHTML(item.id)}"${item.id === category ? " selected" : ""}>${escapeHTML(item.name)}</option>`)
    .join("");
  const minDate = `${addMonths(currentMonthKey(), -transactionHistoryMonths)}-01`;
  const maxDate = addDays(localDateString(), 1);
  const note = hasRealData
    ? "Record spending your bank did not import. Manual entries count toward your totals."
    : "Adding your first transaction replaces the sample data with your own numbers.";
  $("#dialog-content").innerHTML = `<p class="eyebrow">${existing ? "EDIT" : "ADD"} TRANSACTION</p><h2 class="dialog-title">${existing ? "Edit transaction" : "Add a transaction"}</h2><p class="dialog-subtitle">${note}</p><form id="transaction-form" class="edit-form"><label class="field"><span>Merchant or description</span><input id="tx-name" maxlength="60" required autocomplete="off" value="${escapeHTML(existing?.name ?? "")}"></label><label class="field"><span>Amount</span><input id="tx-amount" type="number" min="0.01" max="1000000" step="0.01" inputmode="decimal" required value="${existing ? existing.amount : ""}"></label><label class="field"><span>Date</span><input id="tx-date" type="date" required min="${minDate}" max="${maxDate}" value="${existing?.date ?? defaultEntryDate()}"></label><label class="field"><span>Category</span><select id="tx-category">${options}</select></label><p class="dialog-form-feedback" id="tx-feedback" aria-live="polite"></p><button class="primary-button" type="submit">${existing ? "Save changes" : "Add transaction"}</button></form>`;
  const dialog = $<HTMLDialogElement>("#detail-dialog");
  if (!dialog.open) dialog.showModal();
  $<HTMLInputElement>("#tx-name").focus();
  refreshIcons();
}

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== "transaction-form") return;
  event.preventDefault();
  const feedback = $("#tx-feedback", form);
  const submit = $<HTMLButtonElement>('button[type="submit"]', form);
  const input = {
    name: $<HTMLInputElement>("#tx-name", form).value.trim(),
    amount: Number($<HTMLInputElement>("#tx-amount", form).value),
    date: $<HTMLInputElement>("#tx-date", form).value,
    category: $<HTMLSelectElement>("#tx-category", form).value
  };
  if (!input.name) {
    feedback.textContent = "Enter a merchant or description.";
    return;
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    feedback.textContent = "Enter an amount greater than $0.";
    return;
  }
  if (!input.date) {
    feedback.textContent = "Choose a date.";
    return;
  }
  submit.disabled = true;
  feedback.textContent = "Saving...";
  const editing = editingManualId;
  const save = editing ? updateManualTransaction(editing, input) : createManualTransaction(input);
  save
    .then(async ({ transaction }) => {
      await reloadViewedMonth();
      $<HTMLDialogElement>("#detail-dialog").close();
      const savedMonth = transaction.date.slice(0, 7);
      showToast(
        savedMonth === viewingMonth
          ? editing ? "Transaction updated." : "Transaction added."
          : `${editing ? "Transaction updated" : "Transaction added"} in ${monthName(savedMonth)}.`
      );
    })
    .catch((error: unknown) => {
      feedback.textContent = error instanceof Error ? error.message : "Could not save that transaction.";
      submit.disabled = false;
    });
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const edit = target?.closest<HTMLElement>("[data-edit-manual]");
  if (edit?.dataset.editManual) {
    openTransactionForm(edit.dataset.editManual);
    return;
  }
  const remove = target?.closest<HTMLElement>("[data-delete-manual]");
  const id = remove?.dataset.deleteManual;
  if (!id) return;
  const entry = manualEntries.get(id);
  if (!window.confirm(`Delete "${entry?.name ?? "this transaction"}"?`)) return;
  const reopen = openCategoryId;
  deleteManualTransaction(id)
    .then(async () => {
      await reloadViewedMonth();
      if (reopen && document.querySelector<HTMLDialogElement>("#detail-dialog")?.open) openCategoryDetails(reopen);
      showToast("Transaction deleted.");
    })
    .catch((error: unknown) => showToast(error instanceof Error ? error.message : "Could not delete that transaction."));
});
