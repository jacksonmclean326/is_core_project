import {
  $,
  escapeHTML,
  eventElement,
  money,
  refreshIcons,
  saveState,
  showToast,
  state,
  checkCategoryWarnings,
  updateCategoryBudgets,
} from "../../core.js";
import {
  createPlaidLinkToken,
  disconnectPlaidItem,
  exchangePlaidPublicToken,
  getAccount,
  getBankConnections,
  refreshBankConnections,
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

function accountBalanceLabel(account: BankAccount): string {
  const value = account.balance ?? account.availableBalance;
  if (value === null || !Number.isFinite(value)) {
    return "Balance unavailable";
  }
  const isCredit = account.type === "credit" && value > 0;
  const balance = Math.abs(value);
  const currencyCode = account.currencyCode?.toUpperCase();
  let formatted = money(balance);
  if (currencyCode && /^[A-Z]{3}$/.test(currencyCode)) {
    try {
      formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode,
        maximumFractionDigits: 2,
      }).format(balance);
    } catch {
      formatted = money(balance);
    }
  }
  return `${isCredit || value < 0 ? "−" : ""}${formatted}`;
}

function formatCheckedAt(value: string | null): string {
  if (!value) return "Not synced yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Last sync time unavailable"
    : `Last checked ${date.toLocaleString()}`;
}

function renderBankConnections() {
  const accounts = bankConnections.flatMap((connection) =>
    connection.accounts.map((account) => ({
      id: account.id,
      institution: connection.institution,
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
    })),
  );
  state.accounts = accounts;
  $("#account-count").textContent =
    `${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`;
  $("#bank-list").innerHTML = bankConnections.length
    ? bankConnections
        .map(
          (connection) => `
            <section class="bank-connection" aria-label="${escapeHTML(connection.institution)}">
              <div class="bank-connection-heading">
                <strong>${escapeHTML(connection.institution)}</strong>
                <button class="bank-disconnect" type="button" data-disconnect-item="${escapeHTML(connection.id)}">
                  Disconnect
                </button>
              </div>
              <p class="bank-connection-meta">${escapeHTML(formatCheckedAt(connection.lastSyncedAt))}</p>
              ${
                connection.accounts.length
                  ? connection.accounts
                      .map(
                        (account) => `
                          <div class="bank-row">
                            <span class="bank-icon"><i data-lucide="landmark" aria-hidden="true"></i></span>
                            <span class="bank-info">
                              <strong>${escapeHTML(account.name)}</strong>
                              <span>${escapeHTML(
                                account.mask
                                  ? `•••• ${account.mask} · ${accountTypeLabel(account)}`
                                  : accountTypeLabel(account),
                              )}</span>
                            </span>
                            <span class="bank-balance">
                              ${escapeHTML(accountBalanceLabel(account))}
                              <small>${
                                account.balance !== null
                                  ? "Current balance"
                                  : account.availableBalance !== null
                                    ? "Available balance"
                                    : ""
                              }</small>
                            </span>
                          </div>
                        `,
                      )
                      .join("")
                  : '<p class="bank-empty">No active accounts are currently available from this connection.</p>'
              }
            </section>
          `,
        )
        .join("")
    : '<p class="bank-empty">No bank accounts connected yet. Connect an institution to see accounts here.</p>';
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

async function renderAuthenticatedProfile() {
  const nameElement = $("#account-name");
  const emailElement = $("#account-email");
  const initialsElement = $("#account-initials");
  const feedback = $("#account-feedback");

  try {
    const user = await getAccount();
    const metadata = user.user_metadata || {};
    const metadataName = [metadata.first_name, metadata.last_name]
      .filter((part) => typeof part === "string" && part.trim())
      .join(" ");
    const name =
      metadataName ||
      (typeof metadata.full_name === "string" ? metadata.full_name.trim() : "") ||
      (typeof metadata.name === "string" ? metadata.name.trim() : "");
    const email = user.email || "";

    nameElement.textContent = name || "Name not provided";
    emailElement.textContent = email || "Email unavailable";
    initialsElement.textContent = (name || email || "?")
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    if (!name) {
      feedback.textContent = "Add your name to your account profile to see it here.";
    }
  } catch (error) {
    console.error("Unable to load the signed-in account profile.", error);
    nameElement.textContent = "Account details unavailable";
    emailElement.textContent = "";
    initialsElement.textContent = "?";
    feedback.textContent = "Could not load your account details. Try refreshing the page.";
    feedback.classList.add("is-error");
  }
}

function renderSettings() {
  renderBankConnections();
  $<HTMLInputElement>("#monthly-budget").value = state.budget ? String(state.budget) : "";
  $<HTMLInputElement>("#monthly-income").value = state.income ? String(state.income) : "";
  $<HTMLInputElement>("#sync-toggle").checked = state.preferences.sync;
  $<HTMLInputElement>("#reminder-toggle").checked = state.preferences.reminders;
  $<HTMLInputElement>("#leaderboard-toggle").checked = state.preferences.leaderboard;
  refreshIcons();
}

$("#budget-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const budgetValue = $<HTMLInputElement>("#monthly-budget").value;
  const income = Number($<HTMLInputElement>("#monthly-income").value);
  const budget = budgetValue ? Number(budgetValue) : null;
  const feedback = $("#budget-feedback");
  if (budget && budget > income) {
    feedback.textContent =
      "Your budget should fit within your monthly income. Adjust either amount to continue.";
    return;
  }
  if (budget) updateCategoryBudgets(budget);
  state.budget = budget;
  state.income = income;
  saveState();
  feedback.textContent = budget
    ? "Budget saved."
    : "Budget cleared. Your dashboard will show NO BUDGET.";
  checkCategoryWarnings();
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

const preferenceControls: [string, keyof typeof state.preferences][] = [
  ["#sync-toggle", "sync"],
  ["#reminder-toggle", "reminders"],
  ["#leaderboard-toggle", "leaderboard"],
];
preferenceControls.forEach(([selector, key]) => {
  $<HTMLInputElement>(selector).addEventListener("change", (event) => {
    const checked = (event.currentTarget as HTMLInputElement).checked;
    state.preferences[key] = checked;
    saveState();
    if (key === "leaderboard")
      showToast(
        checked
          ? "Your progress is visible to friends."
          : "Your leaderboard progress is hidden.",
      );
  });
});

$("#privacy-link").addEventListener("click", () => {
  $("#dialog-content").innerHTML =
    `<p class="eyebrow">YOUR ACCOUNT</p><h2 class="dialog-title">Privacy & data</h2><p class="dialog-subtitle">Plaid connects your financial institution. Money Man stores linked account details and balances in Supabase; it does not import or store transactions. Plaid's Transactions product is enabled for Link eligibility, may process transaction data under Plaid's terms, and may have separate fees. Disconnecting removes the saved account connection while leaving any existing transactions without an account link.</p>`;
  $<HTMLDialogElement>("#detail-dialog").showModal();
});
$("#help-link").addEventListener("click", () => {
  $("#dialog-content").innerHTML =
    `<p class="eyebrow">HERE TO HELP</p><h2 class="dialog-title">Help & support</h2><p class="dialog-subtitle">Connect or disconnect financial institutions in Settings. Plaid account data is refreshed when Settings loads; Plaid may return cached balances rather than real-time values. Budgets and goals can be changed in Settings or from Edit on the Details page.</p>`;
  $<HTMLDialogElement>("#detail-dialog").showModal();
});
renderSettings();
renderAuthenticatedProfile();
void loadBankConnections(true).catch((error: unknown) => {
  console.error("Unable to load connected bank accounts.", error);
  const feedback = $("#link-feedback");
  feedback.textContent =
    error instanceof Error
      ? error.message
      : "Could not load bank accounts. Try refreshing the page.";
  feedback.classList.add("is-error");
});
refreshIcons();
