import { leaderboardVisibilityEvent } from "../../../shared/leaderboard.js";
import {
  $,
  escapeHTML,
  eventElement,
  conversionInfo,
  displayToUsd,
  getCurrency,
  profileInitials,
  setRates,
  shownCurrency,
  toInputValue,
  refreshIcons,
  saveState,
  setCurrency,
  showToast,
  state,
  checkCategoryWarnings,
  loadLinkedTransactions,
  updateCategoryBudgets,
} from "../../core.js";
import {
  getBudget,
  getRates,
  getAccount,
  saveBudget,
  updateAccount,
  updateAccountCurrency,
  updateAccountPreference,
  type AccountPreferences,
} from "../../api.js";
import { currencies, currencyOrDefault, currencySymbol } from "../../../shared/currencies.js";
import { currentMonthKey, shortDateLabel } from "../../../shared/months.js";
import "../../page-navigation.js";

let accountFirstName = "";
let accountLastName = "";
let accountEmail = "";

function updateCurrencySymbols() {
  const symbol = currencySymbol(shownCurrency());
  document.querySelectorAll(".currency-symbol").forEach((element) => {
    element.textContent = symbol;
  });
}

/** "1 USD = 0.8957 EUR", with where the rate comes from, under the picker. */
function renderRateNote() {
  const info = conversionInfo();
  $("#currency-rate").textContent = info
    ? `1 USD = ${info.rate.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${info.code}. European Central Bank rate from ${shortDateLabel(info.date)}, refreshed daily.`
    : getCurrency() === "USD"
      ? "Amounts are stored in US dollars, so no conversion is needed."
      : "The exchange rate is not available right now, so amounts are shown in US dollars.";
}

function renderCurrencyPicker() {
  const select = $<HTMLSelectElement>("#currency-select");
  select.innerHTML = currencies
    .map(
      (currency) =>
        `<option value="${currency.code}">${escapeHTML(currency.code)} · ${escapeHTML(currency.name)}</option>`,
    )
    .join("");
  select.value = getCurrency();
  updateCurrencySymbols();
  renderRateNote();
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
    initialsElement.textContent = profileInitials(name, accountEmail);
    $<HTMLInputElement>("#sync-toggle").checked = state.preferences.sync;
    $<HTMLInputElement>("#reminder-toggle").checked = state.preferences.reminders;
    $<HTMLInputElement>("#leaderboard-toggle").checked = state.preferences.leaderboard;
    if (setCurrency(currencyOrDefault(user.currency ?? metadata.currency))) {
      renderCurrencyPicker();
    }
    if (!name) {
      feedback.textContent = "Add your name to your account profile to see it here.";
    }
  } catch (error) {
    console.error("Unable to load the signed-in account profile.", error);
    nameElement.textContent = "Account details unavailable";
    emailElement.textContent = "";
    initialsElement.textContent = "";
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
  $<HTMLInputElement>("#monthly-budget").value = state.budget ? toInputValue(state.budget) : "";
  $<HTMLInputElement>("#monthly-income").value = state.income ? toInputValue(state.income) : "";
  $<HTMLInputElement>("#sync-toggle").checked = state.preferences.sync;
  $<HTMLInputElement>("#reminder-toggle").checked = state.preferences.reminders;
  $<HTMLInputElement>("#leaderboard-toggle").checked = state.preferences.leaderboard;
  renderCurrencyPicker();
  refreshIcons();
}

async function loadSavedBudget() {
  try {
    const { budget } = await getBudget(currentMonthKey());
    if (!budget) return;
    state.budget = budget.monthlyBudget;
    state.income = budget.monthlyIncome;
    $<HTMLInputElement>("#monthly-budget").value = budget.monthlyBudget
      ? toInputValue(budget.monthlyBudget)
      : "";
    $<HTMLInputElement>("#monthly-income").value = toInputValue(budget.monthlyIncome);
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
  // Typed in the chosen currency, saved in dollars.
  const income = displayToUsd(Number($<HTMLInputElement>("#monthly-income").value));
  const budget = budgetValue ? displayToUsd(Number(budgetValue)) : null;
  const feedback = $("#budget-feedback");
  if (budget && budget > income) {
    feedback.textContent =
      "Your budget should fit within your monthly income. Adjust either amount to continue.";
    feedback.classList.add("is-error");
    return;
  }
  const submitButton = $<HTMLButtonElement>('#budget-form button[type="submit"]');
  submitButton.disabled = true;
  feedback.classList.remove("is-error");
  feedback.textContent = "Saving…";
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
      ? "Saved to your account."
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

$("#currency-select").addEventListener("change", async (event) => {
  const select = event.currentTarget as HTMLSelectElement;
  const previous = getCurrency();
  const next = select.value;
  const feedback = $("#currency-feedback");
  select.disabled = true;
  feedback.classList.remove("is-error");
  feedback.textContent = "Getting the exchange rate…";
  try {
    // The rate has to be in hand before switching, or amounts would show a new symbol on dollar values.
    if (next !== "USD") setRates(await getRates());
    const saved = await updateAccountCurrency(next);
    setCurrency(saved.currency);
    renderSettings();
    const name = currencies.find((currency) => currency.code === saved.currency)?.name ?? saved.currency;
    feedback.textContent = `Saved. Amounts now show in ${name}, converted from US dollars.`;
    showToast(`Currency set to ${saved.currency}.`);
  } catch (error) {
    select.value = previous;
    feedback.textContent = error instanceof Error
      ? error.message
      : "Could not save your currency. Please try again.";
    feedback.classList.add("is-error");
  } finally {
    select.disabled = false;
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
      if (key === "leaderboard") {
        feedback.textContent = control.checked
          ? "Your score is now visible on your and your friends' leaderboards."
          : "Your score is now hidden from all leaderboards. You can still view your friends' scores.";
        showToast(control.checked ? "Leaderboard visibility enabled." : "Your leaderboard score is hidden.");
        // Other tabs refresh from the server; this event carries no profile or financial data.
        try {
          localStorage.setItem(leaderboardVisibilityEvent, crypto.randomUUID());
        } catch {
          // Storage may be blocked; focus and periodic refresh still update the leaderboard.
        }
      }
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
  });
});

renderSettings();
void loadSavedBudget();
void renderAuthenticatedProfile();
refreshIcons();
// Budget reminders compare real current-month spending once a bank is linked.
void loadLinkedTransactions();
