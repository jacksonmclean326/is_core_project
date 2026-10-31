import type { IncomingMessage, ServerResponse } from "node:http";
import {
  CountryCode,
  Products,
  type AccountBase,
  type PlaidApi,
} from "plaid";
import { createServiceSupabaseClient } from "../auth/supabase.js";
import { requireSession } from "../auth/session.js";
import { config } from "../config.js";
import { HttpError, supabaseFailure } from "../errors.js";
import { readJsonBody, requiredString } from "../http/request-body.js";
import { sendJson } from "../http/response.js";
import {
  createPlaidClient,
  decryptPlaidAccessToken,
  encryptPlaidAccessToken,
  logPlaidFailure,
  plaidFailure,
} from "../plaid/client.js";

interface PlaidItemRow {
  item_id: string;
  user_id: string;
  institution_name: string;
  access_token_encrypted?: string;
  last_synced_at: string | null;
}

interface IncomeSourceRow {
  source_id: string;
  user_id: string;
  plaid_connection_id: string | null;
  plaid_account_id: string | null;
  account_name: string | null;
  official_name: string | null;
  account_mask: string | null;
  account_subtype: string | null;
  source_type: string | null;
  balance: number | null;
  available_balance: number | null;
  currency_code: string | null;
  balance_synced_at: string | null;
}

interface PublicBankAccount {
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

interface PublicBankConnection {
  id: string;
  institution: string;
  lastSyncedAt: string | null;
  accounts: PublicBankAccount[];
}

interface BankConnectionsResponse {
  connections: PublicBankConnection[];
  syncWarning?: string;
}

function requirePlaidStorage(requireEncryptionKey = true): void {
  if (!config.supabaseSecretKey) {
    throw new HttpError(
      503,
      "Plaid account storage is not configured. Set SUPABASE_SECRET_KEY on the server.",
    );
  }
  if (requireEncryptionKey && !config.plaidTokenEncryptionKey) {
    throw new HttpError(
      503,
      "Plaid token encryption is not configured on the server.",
    );
  }
}

function optionalString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : null;
}

function linkInstitution(body: Record<string, unknown>): {
  id: string | null;
  name: string;
} {
  if (typeof body.institutionId === "string" && !/^ins_[A-Za-z0-9]+$/.test(body.institutionId)) {
    throw new HttpError(400, "The selected institution is invalid.");
  }
  return {
    id: optionalString(body.institutionId, 100),
    name:
      optionalString(body.institutionName, 200) ??
      "Connected financial institution",
  };
}

function accountSource(
  account: AccountBase,
  connectionId: string,
  userId: string,
  checkedAt: string,
) {
  return {
    user_id: userId,
    plaid_connection_id: connectionId,
    plaid_account_id: account.account_id,
    account_name: account.name,
    official_name: account.official_name,
    account_mask: account.mask,
    account_subtype: account.subtype,
    source_type: account.type,
    balance: account.balances.current,
    available_balance: account.balances.available,
    currency_code:
      account.balances.iso_currency_code ??
      account.balances.unofficial_currency_code,
    balance_synced_at: checkedAt,
  };
}

async function syncConnection(
  plaid: PlaidApi,
  admin: ReturnType<typeof createServiceSupabaseClient>,
  connection: PlaidItemRow,
): Promise<string | null> {
  if (!connection.access_token_encrypted) {
    console.error("A saved Plaid connection has no encrypted access token.");
    return null;
  }
  let accessToken: string;
  try {
    accessToken = decryptPlaidAccessToken(connection.access_token_encrypted);
  } catch {
    console.error("A saved Plaid token could not be decrypted; reconnect it.");
    return null;
  }
  let accounts: AccountBase[];
  try {
    const response = await plaid.accountsGet({ access_token: accessToken });
    accounts = response.data.accounts;
  } catch (error) {
    logPlaidFailure(error, "accounts/get");
    return null;
  }

  const checkedAt = new Date().toISOString();
  const rows = accounts.map((account) =>
    accountSource(account, connection.item_id, connection.user_id, checkedAt),
  );
  if (rows.length) {
    const saved = await admin
      .from("Income Source")
      .upsert(rows, {
        onConflict: "plaid_connection_id,plaid_account_id",
      });
    if (saved.error) throw supabaseFailure(saved.error);
  }

  const existing = await admin
    .from("Income Source")
    .select("source_id,plaid_account_id")
    .eq("user_id", connection.user_id)
    .eq("plaid_connection_id", connection.item_id)
    .returns<Pick<IncomeSourceRow, "source_id" | "plaid_account_id">[]>();
  if (existing.error) throw supabaseFailure(existing.error);

  const currentAccountIds = new Set(accounts.map((account) => account.account_id));
  const removedIds = (existing.data ?? [])
    .filter(
      (row) =>
        row.plaid_account_id !== null &&
        !currentAccountIds.has(row.plaid_account_id),
    )
    .map((row) => row.source_id);
  for (const sourceId of removedIds) {
    const removed = await admin
      .from("Income Source")
      .delete()
      .eq("source_id", sourceId)
      .eq("user_id", connection.user_id);
    if (removed.error) throw supabaseFailure(removed.error);
  }

  const updated = await admin
    .from("Plaid Item")
    .update({ last_synced_at: checkedAt })
    .eq("item_id", connection.item_id)
    .eq("user_id", connection.user_id);
  if (updated.error) throw supabaseFailure(updated.error);
  return checkedAt;
}

async function readConnections(
  userId: string,
  sync: boolean,
): Promise<BankConnectionsResponse> {
  const admin = createServiceSupabaseClient();
  const itemColumns = sync
    ? "item_id,user_id,institution_name,access_token_encrypted,last_synced_at"
    : "item_id,user_id,institution_name,last_synced_at";
  const itemResult = await admin
    .from("Plaid Item")
    .select(itemColumns)
    .eq("user_id", userId)
    .returns<PlaidItemRow[]>();
  if (itemResult.error) throw supabaseFailure(itemResult.error);
  const items = itemResult.data ?? [];

  let failedRefreshes = 0;
  if (sync && items.length) {
    const plaid = createPlaidClient();
    for (const item of items) {
      const lastSyncedAt = await syncConnection(plaid, admin, item);
      if (lastSyncedAt) item.last_synced_at = lastSyncedAt;
      else failedRefreshes += 1;
    }
  }

  const accountResult = await admin
    .from("Income Source")
    .select(
      "source_id,user_id,plaid_connection_id,plaid_account_id,account_name,official_name,account_mask,account_subtype,source_type,balance,available_balance,currency_code,balance_synced_at",
    )
    .eq("user_id", userId)
    .not("plaid_connection_id", "is", null)
    .returns<IncomeSourceRow[]>();
  if (accountResult.error) throw supabaseFailure(accountResult.error);

  const accountsByConnection = new Map<string, PublicBankAccount[]>();
  for (const row of accountResult.data ?? []) {
    if (!row.plaid_connection_id) continue;
    const accounts = accountsByConnection.get(row.plaid_connection_id) ?? [];
    accounts.push({
      id: row.source_id,
      name: row.account_name ?? "Bank account",
      officialName: row.official_name,
      mask: row.account_mask,
      type: row.source_type ?? "other",
      subtype: row.account_subtype,
      balance: row.balance,
      availableBalance: row.available_balance,
      currencyCode: row.currency_code,
    });
    accountsByConnection.set(row.plaid_connection_id, accounts);
  }

  const connections: PublicBankConnection[] = items.map((item) => ({
    id: item.item_id,
    institution: item.institution_name,
    lastSyncedAt: item.last_synced_at,
    accounts: accountsByConnection.get(item.item_id) ?? [],
  }));
  return {
    connections,
    ...(failedRefreshes
      ? {
          syncWarning:
            "Some bank connections could not be refreshed. Showing their last saved account data.",
        }
      : {}),
  };
}

async function removeConnection(
  plaid: PlaidApi,
  item: PlaidItemRow,
  admin: ReturnType<typeof createServiceSupabaseClient>,
): Promise<void> {
  if (!item.access_token_encrypted) {
    throw new HttpError(
      500,
      "This bank connection cannot be disconnected. Please contact support.",
    );
  }
  const accessToken = decryptPlaidAccessToken(item.access_token_encrypted);
  try {
    await plaid.itemRemove({ access_token: accessToken });
  } catch (error) {
    throw plaidFailure(
      error,
      "item/remove",
      "Plaid could not disconnect this bank. Your saved connection was not deleted.",
    );
  }

  const removed = await admin
    .from("Plaid Item")
    .delete()
    .eq("item_id", item.item_id)
    .eq("user_id", item.user_id);
  if (removed.error) throw supabaseFailure(removed.error);
}

export async function handlePlaidApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === "/api/plaid/link-token" && request.method === "POST") {
    const { user } = await requireSession(request, response);
    requirePlaidStorage();
    const plaid = createPlaidClient();
    try {
      const result = await plaid.linkTokenCreate({
        client_name: "Money Man",
        language: "en",
        country_codes: [CountryCode.Us],
        products: [Products.Transactions],
        user: { client_user_id: user.id },
      });
      sendJson(response, 200, { linkToken: result.data.link_token });
    } catch (error) {
      throw plaidFailure(
        error,
        "link/token/create",
        "Plaid could not start a bank connection. Please try again.",
      );
    }
    return true;
  }

  if (pathname === "/api/plaid/exchange" && request.method === "POST") {
    const { user } = await requireSession(request, response);
    requirePlaidStorage();
    const body = await readJsonBody(request);
    const publicToken = requiredString(body.publicToken, "Plaid public token", 2048);
    const institution = linkInstitution(body);
    const plaid = createPlaidClient();
    const admin = createServiceSupabaseClient();

    let exchanged: Awaited<ReturnType<typeof plaid.itemPublicTokenExchange>>;
    try {
      exchanged = await plaid.itemPublicTokenExchange({
        public_token: publicToken,
      });
    } catch (error) {
      throw plaidFailure(
        error,
        "item/public_token/exchange",
        "Plaid could not finish connecting this bank. Please try again.",
      );
    }

    const accessToken = exchanged.data.access_token;
    const plaidItemId = exchanged.data.item_id;
    let internalItemId: string | null = null;
    try {
      const inserted = await admin
        .from("Plaid Item")
        .insert({
          plaid_item_id: plaidItemId,
          user_id: user.id,
          institution_id: institution.id,
          institution_name: institution.name,
          access_token_encrypted: encryptPlaidAccessToken(accessToken),
        })
        .select("item_id")
        .single();
      if (inserted.error) throw supabaseFailure(inserted.error);
      const itemId = inserted.data.item_id;
      internalItemId = itemId;

      const result = await plaid.accountsGet({ access_token: accessToken });
      const checkedAt = new Date().toISOString();
      const rows = result.data.accounts.map((account) =>
        accountSource(account, itemId, user.id, checkedAt),
      );
      if (rows.length) {
        const savedAccounts = await admin
          .from("Income Source")
          .upsert(rows, {
            onConflict: "plaid_connection_id,plaid_account_id",
          });
        if (savedAccounts.error) throw supabaseFailure(savedAccounts.error);
      }

      const synced = await admin
        .from("Plaid Item")
        .update({ last_synced_at: checkedAt })
        .eq("item_id", itemId)
        .eq("user_id", user.id);
      if (synced.error) throw supabaseFailure(synced.error);
    } catch (error) {
      if (internalItemId) {
        const deleted = await admin
          .from("Plaid Item")
          .delete()
          .eq("item_id", internalItemId)
          .eq("user_id", user.id);
        if (deleted.error) {
          console.error("Unable to roll back an incomplete Plaid connection.");
        }
      }
      try {
        await plaid.itemRemove({ access_token: accessToken });
      } catch {
        console.error("Unable to revoke an incomplete Plaid connection.");
      }
      if (error instanceof HttpError) throw error;
      throw plaidFailure(
        error,
        "accounts/get",
        "Plaid connected this institution but account details could not be saved.",
      );
    }

    sendJson(response, 200, { ok: true });
    return true;
  }

  if (pathname === "/api/plaid/accounts" && request.method === "GET") {
    const { user } = await requireSession(request, response);
    requirePlaidStorage(false);
    sendJson(response, 200, await readConnections(user.id, false));
    return true;
  }

  if (pathname === "/api/plaid/accounts/refresh" && request.method === "POST") {
    const { user } = await requireSession(request, response);
    requirePlaidStorage();
    sendJson(response, 200, await readConnections(user.id, true));
    return true;
  }

  const itemMatch = pathname.match(/^\/api\/plaid\/items\/([0-9a-f-]{36})$/i);
  if (itemMatch && request.method === "DELETE") {
    const { user } = await requireSession(request, response);
    requirePlaidStorage();
    const admin = createServiceSupabaseClient();
    const result = await admin
      .from("Plaid Item")
      .select(
        "item_id,user_id,institution_name,access_token_encrypted,last_synced_at",
      )
      .eq("item_id", itemMatch[1])
      .eq("user_id", user.id)
      .single();
    if (result.error) {
      if (result.error.code === "PGRST116") {
        throw new HttpError(404, "This bank connection was not found.");
      }
      throw supabaseFailure(result.error);
    }

    await removeConnection(createPlaidClient(), result.data, admin);
    sendJson(response, 200, { ok: true });
    return true;
  }

  return false;
}
