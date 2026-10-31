const palette = ["#2f6854", "#e7745a", "#537f9e", "#d5a33e", "#9b8cb4", "#a9bc9f", "#d9d5c7"];
const storageKey = "money-man-prototype";
const legacyStorageKey = "monarch-prototype";

export interface Category {
  id: string;
  name: string;
  amount: number;
  limit: number;
  color: string;
  visible: boolean;
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
  accounts: [
    { id: "checking", institution: "Chase Checking", detail: "•••• 2841 · Checking", balance: 2148 },
    { id: "card", institution: "Discover Card", detail: "•••• 1906 · Credit card", balance: -386 }
  ],
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
      categories: initialState.categories.map((category) => ({
        ...category,
        ...(savedState.categories || []).find((item) => item.id === category.id)
      })),
      goals: Array.isArray(savedState.goals) ? savedState.goals : structuredClone(initialState.goals),
      friends,
      accounts: Array.isArray(savedState.accounts) ? savedState.accounts : structuredClone(initialState.accounts),
      preferences: { ...initialState.preferences, ...savedState.preferences },
      profile: structuredClone(initialState.profile)
    };
  } catch {
    return structuredClone(initialState);
  }
}

export const state: AppState = loadState();
export const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const months = ["May", "Jun", "Jul", "Aug", "Sep", "Oct"];
export const trends: Record<TrendMode, { values: number[]; caption: string; format: (value: number) => string }> = {
  spending: { values: [1920, 1880, 2050, 1800, 1890, 1740], caption: "spent this month", format: (value) => currency.format(value) },
  under: { values: [13, 18, 7, 15, 14, 21], caption: "under budget this month", format: (value) => `${value}%` },
  saved: { values: [240, 290, 190, 330, 310, 460], caption: "saved this month", format: (value) => currency.format(value) }
};
export const transactions: Record<string, [string, string][]> = {
  housing: [["Campus apartment", "$540"], ["Campus parking", "$90"], ["Renter's insurance", "$60"]],
  food: [["Green Market", "$74"], ["Cedar Cafe", "$48"], ["Grocery Co-op", "$154"]],
  transport: [["City transit pass", "$68"], ["Ride share", "$36"]],
  utilities: [["Electric company", "$74"], ["Internet", "$46"]],
  education: [["Campus bookstore", "$58"], ["Print services", "$38"]],
  personal: [["Corner pharmacy", "$43"], ["Clothing store", "$82"], ["Streaming", "$59"]],
  other: [["Coffee shop", "$32"], ["Campus event", "$48"], ["Other purchases", "$190"]]
};

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
  localStorage.setItem(storageKey, JSON.stringify(state));
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
  const detailRows = rows.map(([name, amount]) => `<div class="transaction-row"><span>${escapeHTML(name)}<small>Oct 1 · Linked account</small></span><span>${escapeHTML(amount)}</span></div>`).join("");
  const chartTotal = state.categories.filter((item) => item.visible).reduce((total, item) => total + Number(item.amount || 0), 0);
  const share = chartTotal ? category.amount / chartTotal * 100 : 0;
  const limit = Number(category.limit) || 0;
  const used = limit ? Math.min(100, category.amount / limit * 100) : 0;
  const isClose = limit > 0 && used >= 90;
  const status = limit ? (used >= 100 ? "Category limit reached" : isClose ? "Close to category limit" : "Within category budget") : "No category limit set";
  const average = rows.length ? category.amount / rows.length : category.amount;
  $("#dialog-content").innerHTML = `<p class="eyebrow">OCTOBER SPENDING</p><h2 class="dialog-title">${escapeHTML(category.name)}</h2><p class="dialog-subtitle">Category spending details</p><section class="category-detail-summary" aria-label="${escapeHTML(category.name)} spending summary"><p>Spent in October</p><strong class="category-detail-amount">${money(category.amount)}</strong><span class="category-detail-limit">${limit ? `of ${money(limit)} monthly limit` : "No monthly limit"}</span><div class="category-detail-track"><span style="width:${used}%;background:${category.color}"></span></div><div class="category-detail-status${isClose ? " is-close" : ""}"><i data-lucide="${isClose ? "triangle-alert" : "circle-check"}" aria-hidden="true"></i><span>${status}</span></div><div class="category-detail-stats"><div><span>Share</span><strong>${share.toFixed(1)}%</strong></div><div><span>Purchases</span><strong>${rows.length}</strong></div><div><span>Average</span><strong>${money(average)}</strong></div></div></section><section class="category-detail-transactions"><h3>Transactions</h3>${detailRows}</section>`;
  $<HTMLDialogElement>("#detail-dialog").showModal();
  refreshIcons();
}

document.addEventListener("click", (event) => {
  const dialog = document.querySelector<HTMLDialogElement>("#detail-dialog");
  const target = event.target;
  if (dialog && (target === dialog || target instanceof Element && target.closest(".dialog-close"))) dialog.close();
});
