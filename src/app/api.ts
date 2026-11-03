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
}

export interface BankConnection {
  id: string;
  institution: string;
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

export function createCategory(name: string): Promise<{ category: CustomCategory }> {
  return request("/api/categories", { method: "POST", body: JSON.stringify({ name }) });
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

export function putGoals(items: { id: string; kind: string; name: string; target: number }[]): Promise<{ goals: import("./goals.js").GoalRow[] }> {
  return request("/api/goals", { method: "PUT", body: JSON.stringify({ items }) });
}
