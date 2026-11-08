import { $, convertToDisplay, escapeHTML, eventElement, money, refreshIcons, shownCurrency, state } from "../../core.js";
import {
  createPlaidLinkToken,
  disconnectPlaidItem,
  exchangePlaidPublicToken,
  getBankConnections,
  refreshBankConnections,
  renameBankConnection,
  updateBankAccount,
  type BankAccount,
  type BankConnection,
} from "../../api.js";
import "../../page-navigation.js";

declare global {
  interface Window {
    Plaid?: {
      create(configuration: {
        token: string;
        onSuccess(
          publicToken: string,
          metadata: {
            institution?: {
              institution_id: string | null;
              name: string;
            } | null;
          },
        ): void;
        onExit(error: { error_message?: string } | null, metadata: unknown): void;
      }): { open(): void };
    };
  }
}

let bankConnections: BankConnection[] = [];
let plaidLinkScript: Promise<void> | null = null;

function accountTypeLabel(account: BankAccount): string {
  return (account.subtype || account.type)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * A balance for display. Banks report each account in its own currency; it is converted to the chosen display
 * currency, and the bank's own figure is returned too whenever the two differ.
 */
function accountBalance(account: BankAccount): { main: string; native: string | null } | null {
  const value = account.balance ?? account.availableBalance;
  if (value === null || !Number.isFinite(value)) return null;
  const sign = (account.type === "credit" && value > 0) || value < 0 ? "−" : "";
  const amount = Math.abs(value);
  const nativeCode = account.currencyCode?.toUpperCase();
  const validNative = nativeCode && /^[A-Z]{3}$/.test(nativeCode) ? nativeCode : null;
  const format = (number: number, code: string) => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(number);
    } catch {
      return money(number);
    }
  };
  const nativeText = validNative ? `${sign}${format(amount, validNative)}` : null;
  const shown = shownCurrency();
  if (!validNative) return { main: `${sign}${money(amount)}`, native: null };
  if (validNative === shown) return { main: nativeText as string, native: null };
  const converted = convertToDisplay(amount, validNative);
  if (converted === null) return { main: nativeText as string, native: null };
  return { main: `${sign}${format(converted, shown)}`, native: `${nativeText} at the bank` };
}
function balanceText(account: BankAccount): { main: string; caption: string } {
  const balance = accountBalance(account);
  if (!balance) return { main: "Balance unavailable", caption: "" };
  const kind = account.balance !== null ? "Current balance" : "Available balance";
  return { main: balance.main, caption: balance.native ? `${kind} · ${balance.native}` : kind };
}

function formatCheckedAt(value: string | null): string {
  if (!value) return "Not synced yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Last sync time unavailable"
    : `Last checked ${date.toLocaleString()}`;
}

/** Which name is being edited right now, if any. */
let renaming: { kind: "item" | "account"; id: string } | null = null;

const bankName = (connection: BankConnection) => connection.nickname || connection.institution;
const accountName = (account: BankAccount) => account.nickname || account.name;

function renameFormHtml(kind: "item" | "account", id: string, current: string, original: string): string {
  return `<form class="rename-form" data-rename-form data-kind="${kind}" data-id="${escapeHTML(id)}">
    <label class="sr-only" for="rename-input">Name</label>
    <input id="rename-input" class="rename-input" maxlength="40" value="${escapeHTML(current)}" placeholder="${escapeHTML(original)}" autocomplete="off">
    <button class="primary-button" type="submit">Save</button>
    <button class="text-button" type="button" data-cancel-rename>Cancel</button>
    <p class="rename-hint">Up to 40 characters. Leave it blank to go back to “${escapeHTML(original)}”.</p>
  </form>`;
}

function renderBankConnections() {
  const allAccounts = bankConnections.flatMap((connection) =>
    connection.accounts.map((account) => ({ connection, account })),
  );
  const hiddenCount = allAccounts.filter(({ account }) => account.hidden).length;
  state.accounts = allAccounts.map(({ connection, account }) => ({
    id: account.id,
    institution: bankName(connection),
    detail: account.mask
      ? `•••• ${account.mask} · ${accountTypeLabel(account)}`
      : accountTypeLabel(account),
    balance:
      account.balance === null && account.availableBalance === null
        ? 0
        : account.type === "credit" &&
            (account.balance ?? account.availableBalance ?? 0) > 0
          ? -(account.balance ?? account.availableBalance ?? 0)
          : account.balance ?? account.availableBalance ?? 0,
  }));
  $("#account-count").textContent = hiddenCount ? `${allAccounts.length} (${hiddenCount} hidden)` : String(allAccounts.length);

  const accountRow = (account: BankAccount) => {
    const editing = renaming?.kind === "account" && renaming.id === account.id;
    const detail = account.mask ? `•••• ${account.mask} · ${accountTypeLabel(account)}` : accountTypeLabel(account);
    const title = editing
      ? renameFormHtml("account", account.id, account.nickname ?? "", account.name)
      : `<strong>${escapeHTML(accountName(account))}${account.hidden ? ' <span class="bank-tag">Hidden from totals</span>' : ""}</strong>
         <span>${escapeHTML(account.nickname ? `${account.name} · ${detail}` : detail)}</span>`;
    return `
      <div class="bank-row${account.hidden ? " is-hidden" : ""}">
        <span class="bank-icon"><i data-icon="landmark" aria-hidden="true"></i></span>
        <span class="bank-info">${title}</span>
        <span class="bank-balance">
          ${escapeHTML(balanceText(account).main)}
          <small>${escapeHTML(balanceText(account).caption)}</small>
        </span>
        <span class="bank-row-tools">
          ${editing ? "" : `<button class="bank-link" type="button" data-rename-account="${escapeHTML(account.id)}" aria-label="Rename ${escapeHTML(accountName(account))}">Rename</button>`}
          <label class="bank-include"><input type="checkbox" data-include-account="${escapeHTML(account.id)}"${account.hidden ? "" : " checked"}> Include in totals</label>
        </span>
      </div>`;
  };

  $("#bank-list").innerHTML = bankConnections.length
    ? bankConnections
        .map((connection) => {
          const editing = renaming?.kind === "item" && renaming.id === connection.id;
          const heading = editing
            ? renameFormHtml("item", connection.id, connection.nickname ?? "", connection.institution)
            : `<div class="bank-title"><strong>${escapeHTML(bankName(connection))}</strong>${connection.nickname ? `<span class="bank-original">${escapeHTML(connection.institution)}</span>` : ""}</div>
               <div class="bank-tools">
                 <button class="bank-link" type="button" data-rename-item="${escapeHTML(connection.id)}" aria-label="Rename ${escapeHTML(bankName(connection))}">Rename</button>
                 <button class="bank-disconnect" type="button" data-disconnect-item="${escapeHTML(connection.id)}">Disconnect</button>
               </div>`;
          return `
            <section class="bank-connection" aria-label="${escapeHTML(bankName(connection))}">
              <div class="bank-connection-heading">${heading}</div>
              <p class="bank-connection-meta">${escapeHTML(formatCheckedAt(connection.lastSyncedAt))}</p>
              ${
                connection.accounts.length
                  ? connection.accounts.map(accountRow).join("")
                  : '<p class="bank-empty">No active accounts are currently available from this connection.</p>'
              }
            </section>`;
        })
        .join("")
    : '<p class="bank-empty">No bank accounts connected yet. Choose “Connect an account” to add one.</p>';
  refreshIcons();
}
async function loadPlaidLinkSdk(): Promise<void> {
  if (window.Plaid) return;
  if (!plaidLinkScript) {
    plaidLinkScript = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
      script.async = true;
      script.onload = () => {
        if (window.Plaid) resolve();
        else reject(new Error("Plaid Link did not initialize."));
      };
      script.onerror = () => reject(new Error("Plaid Link could not be loaded."));
      document.head.append(script);
    });
  }
  await plaidLinkScript;
}

async function loadBankConnections(refresh: boolean): Promise<void> {
  const feedback = $("#link-feedback");
  const cached = await getBankConnections();
  bankConnections = cached.connections;
  renderBankConnections();
  feedback.textContent = cached.syncWarning ?? "";
  feedback.classList.toggle("is-error", Boolean(cached.syncWarning));
  if (!refresh) return;

  feedback.textContent = "Refreshing account details from Plaid…";
  try {
    const response = await refreshBankConnections();
    bankConnections = response.connections;
    renderBankConnections();
    feedback.textContent = response.syncWarning ?? "";
    feedback.classList.toggle("is-error", Boolean(response.syncWarning));
  } catch (error) {
    console.error("Unable to refresh bank account data.", error);
    feedback.textContent =
      error instanceof Error
        ? error.message
        : "Could not refresh bank accounts. Showing the last saved account data.";
    feedback.classList.add("is-error");
  }
}

$("#refresh-banks").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("#refresh-banks");
  const feedback = $("#link-feedback");
  button.disabled = true;
  try {
    await loadBankConnections(true);
    if (!feedback.classList.contains("is-error")) feedback.textContent = "Balances are up to date.";
  } catch (error) {
    feedback.textContent =
      error instanceof Error ? error.message : "Could not refresh bank accounts. Please try again.";
    feedback.classList.add("is-error");
  } finally {
    button.disabled = false;
  }
});

$("#connect-bank").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("#connect-bank");
  const feedback = $("#link-feedback");
  button.disabled = true;
  feedback.classList.remove("is-error");
  feedback.textContent = "Opening secure bank connection…";
  try {
    await loadPlaidLinkSdk();
    const { linkToken } = await createPlaidLinkToken();
    if (!window.Plaid) throw new Error("Plaid Link did not initialize.");

    let successReceived = false;
    const handler = window.Plaid.create({
      token: linkToken,
      onSuccess: async (publicToken, metadata) => {
        successReceived = true;
        feedback.textContent = "Saving your bank connection…";
        try {
          await exchangePlaidPublicToken({
            publicToken,
            institutionId: metadata.institution?.institution_id ?? null,
            institutionName: metadata.institution?.name ?? null,
          });
          feedback.textContent = "Connected. Loading your saved accounts…";
          try {
            await loadBankConnections(false);
            feedback.textContent = "Your bank account is connected.";
          } catch (error) {
            console.error("Unable to reload connected bank accounts.", error);
            feedback.textContent =
              "Your bank connection was saved, but the account list could not be refreshed.";
            feedback.classList.add("is-error");
          }
        } catch (error) {
          console.error("Unable to save the Plaid bank connection.", error);
          feedback.textContent =
            error instanceof Error
              ? error.message
              : "Could not save your bank connection. Please try again.";
          feedback.classList.add("is-error");
        } finally {
          button.disabled = false;
        }
      },
      onExit: (error) => {
        if (error) {
          feedback.textContent =
            "Plaid could not complete the connection. Please try again.";
          feedback.classList.add("is-error");
        } else if (!successReceived) {
          feedback.textContent = "";
        }
        if (!successReceived) button.disabled = false;
      },
    });
    handler.open();
  } catch (error) {
    console.error("Unable to start the Plaid bank connection.", error);
    feedback.textContent =
      error instanceof Error
        ? error.message
        : "Could not start a bank connection. Please try again.";
    feedback.classList.add("is-error");
    button.disabled = false;
  }
});

$("#bank-list").addEventListener("click", async (event) => {
  const button = eventElement(event)?.closest<HTMLButtonElement>(
    "[data-disconnect-item]",
  );
  const itemId = button?.dataset.disconnectItem;
  if (!button || !itemId) return;
  if (
    !window.confirm(
      "Disconnect this institution? Its saved account records will be deleted. Existing transactions will remain without an account link.",
    )
  ) {
    return;
  }

  const feedback = $("#link-feedback");
  button.disabled = true;
  try {
    await disconnectPlaidItem(itemId);
    try {
      await loadBankConnections(false);
      feedback.textContent = "The institution was disconnected.";
      feedback.classList.remove("is-error");
    } catch (error) {
      console.error("Unable to reload bank connections after disconnect.", error);
      feedback.textContent =
        "The institution was disconnected, but the account list could not be refreshed.";
      feedback.classList.add("is-error");
      button.disabled = false;
    }
  } catch (error) {
    console.error("Unable to disconnect the Plaid bank connection.", error);
    feedback.textContent =
      error instanceof Error
        ? error.message
        : "Could not disconnect the bank. Please try again.";
    feedback.classList.add("is-error");
    button.disabled = false;
  }
});

// ---- Rename and hide/show ----

function startRename(kind: "item" | "account", id: string) {
  renaming = { kind, id };
  renderBankConnections();
  $<HTMLInputElement>("#rename-input").focus();
  $<HTMLInputElement>("#rename-input").select();
}

function stopRename() {
  renaming = null;
  renderBankConnections();
}

$("#bank-list").addEventListener("click", (event) => {
  const target = eventElement(event);
  const item = target?.closest<HTMLElement>("[data-rename-item]");
  if (item?.dataset.renameItem) return startRename("item", item.dataset.renameItem);
  const account = target?.closest<HTMLElement>("[data-rename-account]");
  if (account?.dataset.renameAccount) return startRename("account", account.dataset.renameAccount);
  if (target?.closest("[data-cancel-rename]")) stopRename();
});

$("#bank-list").addEventListener("keydown", (event) => {
  if (event.key === "Escape" && renaming) stopRename();
});

$("#bank-list").addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches("[data-rename-form]")) return;
  event.preventDefault();
  const feedback = $("#link-feedback");
  const id = form.dataset.id ?? "";
  const kind = form.dataset.kind;
  const name = $<HTMLInputElement>("#rename-input", form).value.replace(/\s+/g, " ").trim();
  const buttons = [...form.querySelectorAll<HTMLButtonElement>("button")];
  buttons.forEach((button) => (button.disabled = true));
  feedback.classList.remove("is-error");
  feedback.textContent = "Saving…";
  try {
    if (kind === "item") {
      const saved = await renameBankConnection(id, name);
      const connection = bankConnections.find((entry) => entry.id === id);
      if (connection) connection.nickname = saved.nickname;
    } else {
      const saved = await updateBankAccount(id, { nickname: name });
      for (const connection of bankConnections) {
        const account = connection.accounts.find((entry) => entry.id === id);
        if (account) account.nickname = saved.nickname ?? null;
      }
    }
    renaming = null;
    renderBankConnections();
    feedback.textContent = name ? "Renamed." : "Name cleared. Showing the bank's own name.";
  } catch (error) {
    buttons.forEach((button) => (button.disabled = false));
    feedback.textContent = error instanceof Error ? error.message : "Could not rename that. Please try again.";
    feedback.classList.add("is-error");
  }
});

$("#bank-list").addEventListener("change", async (event) => {
  const box = eventElement(event)?.closest<HTMLInputElement>("[data-include-account]");
  const id = box?.dataset.includeAccount;
  if (!box || !id) return;
  const account = bankConnections.flatMap((connection) => connection.accounts).find((entry) => entry.id === id);
  if (!account) return;
  const feedback = $("#link-feedback");
  const hidden = !box.checked;
  box.disabled = true;
  feedback.classList.remove("is-error");
  feedback.textContent = "Saving…";
  try {
    await updateBankAccount(id, { hidden });
    account.hidden = hidden;
    renderBankConnections();
    feedback.textContent = hidden
      ? `${accountName(account)} is hidden. Its transactions no longer count toward your totals, goals, or chat.`
      : `${accountName(account)} is included in your totals again.`;
  } catch (error) {
    // The box was just flipped. hidden=true means it was unchecked by that click, so it was checked before.
    box.checked = hidden;
    box.disabled = false;
    feedback.textContent = error instanceof Error ? error.message : "Could not update that account. Please try again.";
    feedback.classList.add("is-error");
  }
});

refreshIcons();
void loadBankConnections(true).catch((error: unknown) => {
  console.error("Unable to load connected bank accounts.", error);
  const feedback = $("#link-feedback");
  feedback.textContent =
    error instanceof Error
      ? error.message
      : "Could not load bank accounts. Try refreshing the page.";
  feedback.classList.add("is-error");
  $("#bank-list").innerHTML = '<p class="bank-empty">Your accounts could not be loaded.</p>';
});
