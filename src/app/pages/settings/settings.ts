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
  loadLinkedTransactions,
  updateCategoryBudgets,
} from "../../core.js";
import {
  createPlaidLinkToken,
  disconnectPlaidItem,
  exchangePlaidPublicToken,
  getBudget,
  getAccount,
  getBankConnections,
  refreshBankConnections,
  saveBudget,
  updateAccount,
  updateAccountPreference,
  type AccountPreferences,
  type BankAccount,
  type BankConnection,
} from "../../api.js";
import { currentMonthKey } from "../../../shared/months.js";
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
let accountFirstName = "";
let accountLastName = "";
let accountEmail = "";

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
    accountFirstName =
      (typeof user.first_name === "string" && user.first_name.trim()) ||
      (typeof metadata.first_name === "string" && metadata.first_name.trim()) ||
      "";
    accountLastName =
      (typeof user.last_name === "string" && user.last_name.trim()) ||
      (typeof metadata.last_name === "string" && metadata.last_name.trim()) ||
      "";
    const fallbackName =
      (typeof metadata.full_name === "string" ? metadata.full_name.trim() : "") ||
      (typeof metadata.name === "string" ? metadata.name.trim() : "");
    if (!accountFirstName && !accountLastName && fallbackName) {
      const [firstName, ...lastName] = fallbackName.split(/\s+/);
      accountFirstName = firstName;
      accountLastName = lastName.join(" ");
    }
    const name = [accountFirstName, accountLastName].filter(Boolean).join(" ") || fallbackName;
    accountEmail = user.email_address || user.email || "";
    state.preferences = {
      sync: user.daily_sync !== false,
      reminders: user.budget_reminders !== false,
      leaderboard: user.leaderboard_visibility !== false,
    };
    feedback.textContent = "";
    feedback.classList.remove("is-error");

    nameElement.textContent = name || "Name not provided";
    emailElement.textContent = accountEmail || "Email unavailable";
    initialsElement.textContent = (name || accountEmail || "?")
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    $<HTMLInputElement>("#sync-toggle").checked = state.preferences.sync;
    $<HTMLInputElement>("#reminder-toggle").checked = state.preferences.reminders;
    $<HTMLInputElement>("#leaderboard-toggle").checked = state.preferences.leaderboard;
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

function showAccountEditDialog() {
  $("#dialog-content").innerHTML = `
    <p class="eyebrow">YOUR PROFILE</p>
    <h2 class="dialog-title" id="account-edit-title">Edit account details</h2>
    <p class="dialog-subtitle">Update your name and sign-in information.</p>
    <form id="account-edit-form" class="profile-edit-form">
      <label for="edit-first-name">First name
        <input id="edit-first-name" name="firstName" autocomplete="given-name" maxlength="100" required value="${escapeHTML(accountFirstName)}">
      </label>
      <label for="edit-last-name">Last name
        <input id="edit-last-name" name="lastName" autocomplete="family-name" maxlength="100" required value="${escapeHTML(accountLastName)}">
      </label>
      <label for="edit-email">Email address
        <input id="edit-email" name="email" type="email" autocomplete="email" maxlength="320" required value="${escapeHTML(accountEmail)}">
      </label>
      <label for="edit-password">New password
        <input id="edit-password" name="password" type="password" autocomplete="new-password">
      </label>
      <label for="confirm-password">Confirm new password
        <input id="confirm-password" name="confirmPassword" type="password" autocomplete="new-password">
      </label>
      <p class="form-note">Leave both password fields blank to keep your current password.</p>
      <p class="form-feedback" id="account-edit-feedback" role="alert" aria-live="polite"></p>
      <div class="profile-edit-actions">
        <button class="primary-button" type="submit">Save details</button>
        <button class="text-button" type="button" data-cancel-account-edit>Cancel</button>
      </div>
    </form>`;
  const dialog = $<HTMLDialogElement>("#detail-dialog");
  dialog.setAttribute("aria-labelledby", "account-edit-title");
  dialog.showModal();
  refreshIcons();
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

async function loadSavedBudget() {
  try {
    const { budget } = await getBudget(currentMonthKey());
    if (!budget) return;
    state.budget = budget.monthlyBudget;
    state.income = budget.monthlyIncome;
    $<HTMLInputElement>("#monthly-budget").value = budget.monthlyBudget
      ? String(budget.monthlyBudget)
      : "";
    $<HTMLInputElement>("#monthly-income").value = String(budget.monthlyIncome);
    saveState();
  } catch (error) {
    console.error("Unable to load the saved budget.", error);
    const feedback = $("#budget-feedback");
    feedback.textContent = "Could not load your saved budget. You can still update it and try again.";
    feedback.classList.add("is-error");
  }
}

$("#budget-form").addEventListener("submit", async (event) => {
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
  const submitButton = $<HTMLButtonElement>('#budget-form button[type="submit"]');
  submitButton.disabled = true;
  feedback.classList.remove("is-error");
  feedback.textContent = "Saving budget…";
  try {
    await saveBudget({
      month: currentMonthKey(),
      monthlyBudget: budget,
      monthlyIncome: income,
    });
    if (budget) updateCategoryBudgets(budget);
    state.budget = budget;
    state.income = income;
    saveState();
    feedback.textContent = budget
      ? "Budget saved to your account."
      : "Budget cleared. Your dashboard will show NO BUDGET.";
    checkCategoryWarnings();
  } catch (error) {
    feedback.textContent = error instanceof Error
      ? error.message
      : "Could not save your budget. Please try again.";
    feedback.classList.add("is-error");
  } finally {
    submitButton.disabled = false;
  }
});

$("#edit-account").addEventListener("click", showAccountEditDialog);
$("#dialog-content").addEventListener("click", (event) => {
  if (eventElement(event)?.closest("[data-cancel-account-edit]")) {
    $<HTMLDialogElement>("#detail-dialog").close();
  }
});
$("#detail-dialog").addEventListener("close", () => {
  $<HTMLDialogElement>("#detail-dialog").removeAttribute("aria-labelledby");
});
$("#detail-dialog").addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== "account-edit-form") return;
  event.preventDefault();

  const firstName = $<HTMLInputElement>("#edit-first-name").value.trim();
  const lastName = $<HTMLInputElement>("#edit-last-name").value.trim();
  const email = $<HTMLInputElement>("#edit-email").value.trim();
  const password = $<HTMLInputElement>("#edit-password").value;
  const confirmPassword = $<HTMLInputElement>("#confirm-password").value;
  const feedback = $("#account-edit-feedback");
  const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');

  if (password !== confirmPassword) {
    feedback.textContent = "The passwords do not match.";
    feedback.classList.add("is-error");
    return;
  }

  if (submitButton) submitButton.disabled = true;
  feedback.classList.remove("is-error");
  feedback.textContent = "Saving account details…";
  try {
    const result = await updateAccount({
      firstName,
      lastName,
      email,
      ...(password ? { password } : {}),
    });
    await renderAuthenticatedProfile();
    $<HTMLDialogElement>("#detail-dialog").close();
    $("#account-feedback").textContent = result.emailConfirmationRequired
      ? "Your profile is saved. Confirm the change using the link sent to your new email address."
      : "Account details updated.";
  } catch (error) {
    feedback.textContent =
      error instanceof Error
        ? error.message
        : "Could not update your account details. Please try again.";
    feedback.classList.add("is-error");
    if (submitButton) submitButton.disabled = false;
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

const preferenceControls: [string, keyof typeof state.preferences, keyof AccountPreferences][] = [
  ["#sync-toggle", "sync", "daily_sync"],
  ["#reminder-toggle", "reminders", "budget_reminders"],
  ["#leaderboard-toggle", "leaderboard", "leaderboard_visibility"],
];
preferenceControls.forEach(([selector, key, column]) => {
  $<HTMLInputElement>(selector).addEventListener("change", async (event) => {
    const control = event.currentTarget as HTMLInputElement;
    const checked = control.checked;
    const previous = state.preferences[key];
    const feedback = $("#preferences-feedback");
    control.disabled = true;
    state.preferences[key] = checked;
    feedback.classList.remove("is-error");
    feedback.textContent = "Saving preference…";
    try {
      const saved = await updateAccountPreference(column, checked);
      state.preferences[key] = saved[column];
      control.checked = saved[column];
      feedback.textContent = "Preference saved.";
      if (key === "reminders") checkCategoryWarnings();
    } catch (error) {
      state.preferences[key] = previous;
      control.checked = previous;
      feedback.textContent = error instanceof Error
        ? error.message
        : "Could not save this preference. Please try again.";
      feedback.classList.add("is-error");
    } finally {
      control.disabled = false;
    }
    if (key === "leaderboard")
      showToast(
        control.checked
          ? "Your progress is visible to friends."
          : "Your leaderboard progress is hidden.",
      );
  });
});

renderSettings();
void loadSavedBudget();
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
// Budget reminders compare real current-month spending once a bank is linked.
void loadLinkedTransactions();
