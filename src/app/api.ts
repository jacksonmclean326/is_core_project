export interface ApiUser {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown> | null;
  first_name?: string | null;
  last_name?: string | null;
  email_address?: string | null;
  daily_sync?: boolean;
  budget_reminders?: boolean;
  leaderboard_visibility?: boolean;
  currency?: string;
}

export interface AccountPreferences {
  daily_sync: boolean;
  budget_reminders: boolean;
  leaderboard_visibility: boolean;
}

export interface BudgetRecord {
  budgetId: string;
  monthlyBudget: number | null;
  monthlyIncome: number;
  month: string | null;
}

export function getBudget(month: string): Promise<{ budget: BudgetRecord | null }> {
  return request(`/api/budget?month=${encodeURIComponent(month)}`);
}

export function saveBudget(input: {
  month: string;
  monthlyBudget: number | null;
  monthlyIncome: number;
}): Promise<{ budget: BudgetRecord }> {
  return request("/api/budget", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface BankAccount {
  id: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  balance: number | null;
  availableBalance: number | null;
  currencyCode: string | null;
  /** A name the person gave this account, or null to use `name`. */
  nickname?: string | null;
  /** True when the account is left out of totals. */
  hidden?: boolean;
}

export interface BankConnection {
  id: string;
  institution: string;
  /** A name the person gave this connection, or null to use the bank's own name. */
  nickname?: string | null;
  lastSyncedAt: string | null;
  accounts: BankAccount[];
}

export interface BankConnectionsResponse {
  connections: BankConnection[];
  syncWarning?: string;
}

const snapshotPrefix = "money-man-snapshot:";

/** The last response for a month, kept in this tab so a page can show data before the network answers. */
export function readSnapshot(month: string, history: number): TransactionsResponse | null {
  try {
    const value = sessionStorage.getItem(`${snapshotPrefix}${month}:${history}`);
    return value ? (JSON.parse(value) as TransactionsResponse) : null;
  } catch {
    return null;
  }
}

export function saveSnapshot(month: string, history: number, response: TransactionsResponse) {
  try {
    sessionStorage.setItem(`${snapshotPrefix}${month}:${history}`, JSON.stringify(response));
  } catch {
    /* storage full or unavailable: the page simply loads normally */
  }
}

/** Forget every saved snapshot (on sign-in and sign-out, so one person's data never shows for another). */
export function clearSnapshots() {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(snapshotPrefix)) sessionStorage.removeItem(key);
    }
  } catch {
    /* nothing to clear */
  }
}

interface AuthResult {
  user: ApiUser | null;
  authenticated: boolean;
}

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    }
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("The server returned an invalid response.");
  }

  if (!response.ok) {
    if (response.status === 401 && path !== "/api/auth/signin") {
      window.location.assign("/auth");
    }
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "The request could not be completed.";
    throw new ApiError(message);
  }

  return payload as T;
}

export function signIn(email: string, password: string): Promise<AuthResult> {
  clearSnapshots();
  return request("/api/auth/signin", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function signUp(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  fullName: string
): Promise<AuthResult> {
  return request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, firstName, lastName, fullName })
  });
}

export function signOut(): Promise<void> {
  clearSnapshots();
  return request("/api/auth/signout", { method: "POST" });
}

export function getSession(): Promise<{ user: ApiUser | null }> {
  return request("/api/auth/session");
}

export function getAccount(): Promise<ApiUser> {
  return request("/api/account");
}

export function updateAccountPreference(
  preference: keyof AccountPreferences,
  enabled: boolean,
): Promise<AccountPreferences> {
  return request("/api/account/preferences", {
    method: "PATCH",
    body: JSON.stringify({ preference, enabled }),
  });
}

export function updateAccountCurrency(currency: string): Promise<{ currency: string }> {
  return request("/api/account/currency", {
    method: "PATCH",
    body: JSON.stringify({ currency }),
  });
}

export function updateAccount(input: {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
}): Promise<ApiUser & { emailConfirmationRequired: boolean }> {
  return request("/api/account", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getFriendCode(): Promise<{ friendCode: string }> {
  return request("/api/friend-code");
}

export function getBankConnections(): Promise<BankConnectionsResponse> {
  return request("/api/plaid/accounts");
}

export function refreshBankConnections(): Promise<BankConnectionsResponse> {
  return request("/api/plaid/accounts/refresh", { method: "POST" });
}

export function createPlaidLinkToken(): Promise<{ linkToken: string }> {
  return request("/api/plaid/link-token", { method: "POST" });
}

export function exchangePlaidPublicToken(input: {
  publicToken: string;
  institutionId: string | null;
  institutionName: string | null;
}): Promise<{ ok: boolean }> {
  return request("/api/plaid/exchange", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Gives a bank connection a name. A blank name clears it. */
export function renameBankConnection(itemId: string, nickname: string): Promise<{ nickname: string | null }> {
  return request(`/api/plaid/items/${encodeURIComponent(itemId)}`, { method: "PATCH", body: JSON.stringify({ nickname }) });
}

/** Renames an account and/or hides it from totals. */
export function updateBankAccount(
  accountId: string,
  changes: { nickname?: string; hidden?: boolean },
): Promise<{ nickname?: string | null; hidden?: boolean }> {
  return request(`/api/plaid/accounts/${encodeURIComponent(accountId)}`, { method: "PATCH", body: JSON.stringify(changes) });
}

export function disconnectPlaidItem(itemId: string): Promise<{ ok: boolean }> {
  return request(`/api/plaid/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}

export interface LinkedTransaction {
  id: string;
  name: string;
  amount: number;
  date: string;
  category: string;
  account: string;
  institution: string;
  /** typed in by the user rather than imported from a bank */
  manual?: boolean;
}

export interface MonthSummary {
  month: string;
  total: number;
  byCategory: Record<string, number>;
}

export interface CustomCategory {
  key: string;
  name: string;
  color: string;
}

export interface TransactionsResponse {
  month: string;
  customCategories?: CustomCategory[];
  history?: MonthSummary[];
  connected: boolean;
  /** the bank is still being synced in the background; ask again shortly */
  syncing?: boolean;
  transactions: LinkedTransaction[];
  warning?: string;
}

/** `month` is "YYYY-MM"; `history` adds summaries for that many earlier months. */
export function getTransactions(month: string, history = 0): Promise<TransactionsResponse> {
  const params = new URLSearchParams({ month });
  if (history) params.set("history", String(history));
  return request(`/api/transactions?${params}`);
}

export function createCategory(name: string, color?: string): Promise<{ category: CustomCategory }> {
  return request("/api/categories", { method: "POST", body: JSON.stringify({ name, ...(color ? { color } : {}) }) });
}

export function renameCategory(key: string, name: string): Promise<{ category: CustomCategory }> {
  return request(`/api/categories/${encodeURIComponent(key)}`, { method: "PATCH", body: JSON.stringify({ name }) });
}

export function deleteCategory(key: string): Promise<{ ok: boolean }> {
  return request(`/api/categories/${encodeURIComponent(key)}`, { method: "DELETE" });
}

/** Moves one transaction; with `applyToMerchant`, every transaction from the same merchant moves (and future ones follow). */
export function recategorizeTransaction(input: {
  transactionId: string;
  category: string;
  applyToMerchant: boolean;
}): Promise<{ moved: number }> {
  return request("/api/transactions/category", { method: "PUT", body: JSON.stringify(input) });
}

export interface ManualTransactionInput {
  name: string;
  amount: number;
  date: string;
  category: string;
}

export function createManualTransaction(input: ManualTransactionInput): Promise<{ transaction: LinkedTransaction }> {
  return request("/api/transactions/manual", { method: "POST", body: JSON.stringify(input) });
}

export function updateManualTransaction(
  id: string,
  changes: Partial<ManualTransactionInput>
): Promise<{ transaction: LinkedTransaction }> {
  return request(`/api/transactions/manual/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) });
}

export function deleteManualTransaction(id: string): Promise<{ ok: boolean }> {
  return request(`/api/transactions/manual/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getGoals(): Promise<{ goals: import("./goals.js").GoalRow[] }> {
  return request("/api/goals");
}

export function putGoals(
  items: {
    id: string;
    kind: string;
    name: string;
    target: number;
    category: string | null;
    deadline: string | null;
    progress: number;
    steps: { text: string; done: boolean }[] | null;
  }[],
): Promise<{ goals: import("./goals.js").GoalRow[] }> {
  return request("/api/goals", { method: "PUT", body: JSON.stringify({ items }) });
}

/** Daily exchange rates: units of each currency per US dollar. */
export function getRates(): Promise<{ base: "USD"; date: string; rates: Record<string, number> }> {
  return request("/api/rates");
}

export type FeedbackKind = "bug" | "confusing" | "idea" | "praise";

/** Sends feedback to the team. Rejects with the server's message if it could not be saved. */
export function sendFeedback(input: { kind: FeedbackKind; message: string; page: string; contactOk: boolean }): Promise<{ ok: true }> {
  return request("/api/feedback", { method: "POST", body: JSON.stringify(input) });
}

/** Saves which steps of one checklist goal are done. */
export function patchGoalSteps(id: string, steps: { text: string; done: boolean }[]): Promise<{ goal: import("./goals.js").GoalRow }> {
  return request("/api/goals/steps", { method: "PATCH", body: JSON.stringify({ id, steps }) });
}

export interface ChatHistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export function getChatHistory(): Promise<{ messages: ChatHistoryMessage[] }> {
  return request("/api/chat");
}

export function sendChat(message: string): Promise<{
  reply: string;
  chatId: string;
  createdAt: string;
}> {
  return request("/api/chat", { method: "POST", body: JSON.stringify({ message }) });
}

export function clearChatHistory(): Promise<{ cleared: number }> {
  return request("/api/chat", { method: "DELETE" });
}

export interface FriendRecord {
  id: string;
  name: string;
}

export function getFriends(): Promise<{ friends: FriendRecord[] }> {
  return request("/api/friends");
}

export function addFriend(code: string): Promise<{ ok: true }> {
  return request("/api/friends", { method: "POST", body: JSON.stringify({ code }) });
}

export function deleteFriend(id: string): Promise<{ ok: true }> {
  return request("/api/friends", { method: "DELETE", body: JSON.stringify({ id }) });
}

export function getLeaderboard(): Promise<{ entries: import("../shared/leaderboard.js").LeaderboardEntry[]; visible: boolean; updatedAt: string }> {
  return request("/api/leaderboard");
}
