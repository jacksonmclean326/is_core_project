import { scaleLimits } from "../../shared/limits.js";
import { createMoneyFormatter, currencyOrDefault, defaultCurrency } from "../../shared/currencies.js";
import { currentMonthKey } from "../../shared/months.js";
import type { GoalStep } from "../../shared/goal-progress.js";
import { showToast } from "../ui/ui.js";
import { getAccount, getBudget, getRates } from "../api.js";

const palette = ["#2f6854", "#e7745a", "#537f9e", "#d5a33e", "#9b8cb4", "#a9bc9f", "#d9d5c7"];

export interface Category {
  id: string;
  name: string;
  amount: number;
  limit: number;
  color: string;
  visible: boolean;
  custom?: boolean;
}

export interface Goal {
  id: string;
  kind: string;
  name: string;
  target: number;
  progress: number;
  /** True when progress is calculated from transactions (Savings and Spending goals). */
  automatic?: boolean;
  /** Spending goals: the category key the limit applies to, or null for all spending. */
  category?: string | null;
  /** Manual goals: the YYYY-MM-DD deadline, or null. */
  deadline?: string | null;
  /** A short explanation of how progress is measured. */
  note?: string | null;
  /** Checklist goals: the steps and which are done. Progress is steps done out of steps. */
  steps?: GoalStep[] | null;
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

export type TrendMode = "spending" | "under" | "saved";

const initialState: AppState = {
  budget: null,
  income: 0,
  streak: 0,
  friendSeedVersion: 1,
  categories: [
    { id: "housing", name: "Housing", amount: 0, limit: 900, color: palette[0], visible: true },
    { id: "food", name: "Food", amount: 0, limit: 300, color: palette[1], visible: true },
    { id: "transport", name: "Transport", amount: 0, limit: 180, color: palette[2], visible: true },
    { id: "utilities", name: "Utilities", amount: 0, limit: 160, color: palette[3], visible: true },
    { id: "education", name: "Education", amount: 0, limit: 140, color: palette[4], visible: true },
    { id: "personal", name: "Personal", amount: 0, limit: 250, color: palette[5], visible: true },
    { id: "other", name: "Other", amount: 0, limit: 350, color: palette[6], visible: true }
  ],
  goals: [],
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

const storageKey = "money-man-prototype";
const legacyStorageKey = "monarch-prototype";

function loadState(): AppState {
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
    const savedCategories = Array.isArray(savedState.categories) ? savedState.categories : [];
    return {
      ...structuredClone(initialState),
      ...savedState,
      friendSeedVersion: 1,
      categories: [
        ...initialState.categories,
        ...savedCategories.filter((item) => item.custom && /^c-[0-9a-f]{8}$/.test(item.id))
      ].map((category) => ({
        ...category,
        ...savedCategories.find((item) => item.id === category.id),
        amount: category.amount
      })),
      goals: [],
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
let accountPreferencesPromise: Promise<void> | null = null;

export function loadAccountPreferences(): Promise<void> {
  if (!accountPreferencesPromise) {
    accountPreferencesPromise = getAccount()
      .then((user) => {
        state.preferences = {
          sync: user.daily_sync !== false,
          reminders: user.budget_reminders !== false,
          leaderboard: user.leaderboard_visibility !== false,
        };
      })
      .catch((error: unknown) => {
        accountPreferencesPromise = null;
        throw error;
      });
  }
  return accountPreferencesPromise;
}

const currencyStorageKey = "money-man-currency";

function readStoredCurrency(): string {
  try {
    return currencyOrDefault(localStorage.getItem(currencyStorageKey));
  } catch {
    return defaultCurrency;
  }
}

let activeCurrency = readStoredCurrency();

/** The currency the person chose. It is saved on the account and cached here so pages paint right away. */
export function getCurrency(): string {
  return activeCurrency;
}

/** Switches the display currency. Returns true when it changed. */
export function setCurrency(code: string): boolean {
  const next = currencyOrDefault(code);
  if (next === activeCurrency) return false;
  activeCurrency = next;
  try {
    localStorage.setItem(currencyStorageKey, next);
  } catch {
    // Storage can be blocked; the account setting still applies on the next page load.
  }
  return true;
}

// ---- Exchange rates -------------------------------------------------------------------------------------
// Everything is stored in US dollars. Amounts are converted when they are shown, and converted back to
// dollars when typed in. Rates are daily reference rates (see src/server/rates.ts), cached in this browser.

const ratesStorageKey = "money-man-rates";
const ratesFreshMs = 6 * 60 * 60 * 1000;

interface StoredRates {
  date: string;
  rates: Record<string, number>;
  fetchedAt: number;
}

function readStoredRates(): StoredRates | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ratesStorageKey) ?? "null");
    if (parsed && typeof parsed === "object") {
      const { date, rates, fetchedAt } = parsed as Partial<StoredRates>;
      if (typeof date === "string" && typeof fetchedAt === "number" && rates && typeof rates === "object") {
        return { date, rates, fetchedAt };
      }
    }
  } catch {
    // Treat unreadable storage as "no rates yet".
  }
  return null;
}

let storedRates = readStoredRates();

/** Units of the chosen currency per US dollar. 1 for dollars, and also while no rate is known yet. */
export function conversionRate(): number {
  if (activeCurrency === defaultCurrency) return 1;
  const rate = storedRates?.rates[activeCurrency];
  return typeof rate === "number" && rate > 0 ? rate : 1;
}

/**
 * The currency amounts are actually drawn in: the chosen one once its rate is known, US dollars until then.
 * That way a euro symbol is never put on a dollar amount.
 */
export function shownCurrency(): string {
  return activeCurrency === defaultCurrency || conversionRate() !== 1 ? activeCurrency : defaultCurrency;
}

/** Date and rate behind the current conversion, for "1 USD = 0.90 EUR (Nov 6)". Null for dollars or no rate. */
export function conversionInfo(): { date: string; rate: number; code: string } | null {
  const rate = conversionRate();
  return activeCurrency !== defaultCurrency && storedRates && rate !== 1 ? { date: storedRates.date, rate, code: activeCurrency } : null;
}

/** A dollar amount as the number to show in the chosen currency. */
export function usdToDisplay(usd: number): number {
  return usd * conversionRate();
}

/** What someone typed in the chosen currency, as dollars to store. Unrounded, so typing 500 and reloading shows 500. */
export function displayToUsd(shown: number): number {
  return shown / conversionRate();
}

/**
 * An amount in another currency (a bank account's own) as the number to show in the chosen currency, or null if
 * either currency has no known rate.
 */
export function convertToDisplay(amount: number, fromCode: string): number | null {
  const fromRate = fromCode === defaultCurrency ? 1 : storedRates?.rates[fromCode];
  if (typeof fromRate !== "number" || fromRate <= 0) return null;
  if (activeCurrency !== defaultCurrency && conversionRate() === 1) return null;
  return (amount / fromRate) * conversionRate();
}

/** A dollar amount as text for an input box: converted and rounded to cents, without trailing zeros. */
export function toInputValue(usd: number): string {
  return String(Math.round(usdToDisplay(usd) * 100) / 100);
}

let formatterCode = "";
let formatter = createMoneyFormatter(defaultCurrency);
function currentFormatter(): Intl.NumberFormat {
  const code = shownCurrency();
  if (code !== formatterCode) {
    formatterCode = code;
    formatter = createMoneyFormatter(code);
  }
  return formatter;
}

/** Stores new rates. Returns true when amounts were showing in dollars only because no rate was known and now can convert. */
export function setRates(snapshot: { date: string; rates: Record<string, number> }): boolean {
  const before = shownCurrency();
  storedRates = { date: snapshot.date, rates: snapshot.rates, fetchedAt: Date.now() };
  try {
    localStorage.setItem(ratesStorageKey, JSON.stringify(storedRates));
  } catch {
    // Not worth interrupting anyone over.
  }
  return shownCurrency() !== before;
}

/**
 * Makes sure the chosen currency has a usable rate, fetching one if the cached copy is missing or older than six
 * hours. Resolves true when the page should reload because amounts can now be converted.
 */
export async function ensureRates(): Promise<boolean> {
  if (activeCurrency === defaultCurrency) return false;
  if (storedRates && Date.now() - storedRates.fetchedAt < ratesFreshMs && storedRates.rates[activeCurrency]) return false;
  try {
    return setRates(await getRates());
  } catch {
    return false;
  }
}

export const currency = { format: (value: number): string => currentFormatter().format(usdToDisplay(value)) };
export const trends: Record<TrendMode, { values: number[]; caption: string; format: (value: number) => string }> = {
  spending: { values: [1920, 1880, 2050, 1800, 1890, 1740], caption: "spent this month", format: (value) => currency.format(value) },
  under: { values: [13, 18, 7, 15, 14, 21], caption: "under budget this month", format: (value) => `${value}%` },
  saved: { values: [240, 290, 190, 330, 310, 460], caption: "saved this month", format: (value) => currency.format(value) }
};

/** [name, amount, detail, id] - `id` is only present for real (linked) transactions. */
export const transactions: Record<string, [string, string, string?, string?][]> = {
  housing: [], food: [], transport: [], utilities: [], education: [], personal: [], other: []
};

/**
 * Loads the budget and income saved on the account for the current month. Home and Details used to show
 * whatever this browser had cached (or a built-in default) until Settings was opened. Returns true if it changed.
 */
export async function loadSavedBudget(): Promise<boolean> {
  try {
    const { budget } = await getBudget(currentMonthKey());
    const nextBudget = budget?.monthlyBudget ?? null;
    const nextIncome = budget?.monthlyIncome ?? 0;
    const changed = state.budget !== nextBudget || state.income !== nextIncome;
    state.budget = nextBudget;
    state.income = nextIncome;
    saveState();
    return changed;
  } catch {
    return false;
  }
}

export function totalSpent(): number {
  return state.categories.reduce((total, category) => total + Number(category.amount || 0), 0);
}

export function money(amount: number): string {
  return currency.format(Math.abs(Number(amount) || 0));
}

export function saveState(): void {
  const { accounts: _accounts, goals: _goals, ...savedState } = state;
  const categories = savedState.categories.map(({ amount: _amount, ...category }) => category);
  localStorage.setItem(storageKey, JSON.stringify({ ...savedState, categories }));
}

export function updateCategoryBudgets(totalBudget: number): void {
  const scaled = scaleLimits(
    state.categories.map((category) => Number(category.limit) || 0),
    Number(state.budget) || 0,
    totalBudget
  );
  state.categories.forEach((category, index) => {
    category.limit = scaled[index] ?? category.limit;
  });
}

export function checkCategoryWarnings(): void {
  if (!state.preferences.reminders) return;
  const nearLimit = state.categories.find((category) => category.limit && category.amount / category.limit >= 0.9);
  if (nearLimit) showToast(`${nearLimit.name} is at ${Math.round(nearLimit.amount / nearLimit.limit * 100)}% of its category budget.`);
}
