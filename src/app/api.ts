export interface ApiUser {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown> | null;
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
  return request("/api/auth/signout", { method: "POST" });
}

export function getSession(): Promise<{ user: ApiUser | null }> {
  return request("/api/auth/session");
}

export function getAccount(): Promise<ApiUser> {
  return request("/api/account");
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
