import { scaleLimits } from "../../shared/limits.js";
import { showToast } from "../ui/ui.js";

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

export function totalSpent(): number {
  return state.categories.reduce((total, category) => total + Number(category.amount || 0), 0);
}

export function money(amount: number): string {
  return currency.format(Math.abs(Number(amount) || 0));
}

export function saveState(): void {
  const { accounts: _accounts, ...savedState } = state;
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
