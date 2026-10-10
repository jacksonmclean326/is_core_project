import {
  $,
  escapeHTML,
  money,
  refreshIcons,
  saveState,
  showToast,
  state,
  checkCategoryWarnings,
  updateCategoryBudgets,
} from "../../core.js";
import { supabase } from "../../supabase.js";

async function renderAuthenticatedProfile() {
  const nameElement = $("#account-name");
  const emailElement = $("#account-email");
  const initialsElement = $("#account-initials");
  const feedback = $("#account-feedback");

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error("No authenticated user was returned.");

    const user = data.user;
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
  $("#bank-list").innerHTML = state.accounts
    .map(
      (account) =>
        `<div class="bank-row"><span class="bank-icon"><i data-lucide="landmark" aria-hidden="true"></i></span><span class="bank-info"><strong>${escapeHTML(account.institution)}</strong><span>${escapeHTML(account.detail)}</span></span><span class="bank-balance">${account.balance < 0 ? "−" : ""}${money(account.balance)}</span></div>`,
    )
    .join("");
  $("#account-count").textContent =
    `${state.accounts.length} ${state.accounts.length === 1 ? "account" : "accounts"}`;
  $("#monthly-budget").value = state.budget || "";
  $("#monthly-income").value = state.income || "";
  $("#sync-toggle").checked = state.preferences.sync;
  $("#reminder-toggle").checked = state.preferences.reminders;
  $("#leaderboard-toggle").checked = state.preferences.leaderboard;
  refreshIcons();
}

$("#budget-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const budgetValue = $("#monthly-budget").value;
  const income = Number($("#monthly-income").value);
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

$("#connect-bank").addEventListener("click", () => {
  const button = $("#connect-bank");
  button.dataset.attempts = String(Number(button.dataset.attempts || 0) + 1);
  const attempts = Number(button.dataset.attempts);
  const feedback = $("#link-feedback");
  if (attempts < 3) {
    feedback.textContent = `This demo can't connect to a bank. Please try again (${attempts} of 3).`;
  } else {
    feedback.textContent =
      "Still having trouble? Add your budget manually for now.";
    $("#manual-entry").hidden = false;
    $("#manual-budget").focus();
  }
});
$("#manual-entry").addEventListener("submit", (event) => {
  event.preventDefault();
  state.budget = Number($("#manual-budget").value);
  saveState();
  renderSettings();
  $("#link-feedback").textContent =
    "Your budget is saved. You can connect your account later in Settings.";
  $("#manual-entry").hidden = true;
});

const preferenceControls = {
  "#sync-toggle": "sync",
  "#reminder-toggle": "reminders",
  "#leaderboard-toggle": "leaderboard",
};
Object.entries(preferenceControls).forEach(([selector, key]) => {
  $(selector).addEventListener("change", (event) => {
    state.preferences[key] = event.target.checked;
    saveState();
    if (key === "leaderboard")
      showToast(
        event.target.checked
          ? "Your progress is visible to friends."
          : "Your leaderboard progress is hidden.",
      );
  });
});

$("#privacy-link").addEventListener("click", () => {
  $("#dialog-content").innerHTML =
    `<p class="eyebrow">YOUR ACCOUNT</p><h2 class="dialog-title">Privacy & data</h2><p class="dialog-subtitle">This prototype stores your sample budget, categories, goals, and friend list in this browser only. No bank connection or data sharing service is active.</p>`;
  $("#detail-dialog").showModal();
});
$("#help-link").addEventListener("click", () => {
  $("#dialog-content").innerHTML =
    `<p class="eyebrow">HERE TO HELP</p><h2 class="dialog-title">Help & support</h2><p class="dialog-subtitle">For this prototype, bank connections and support messaging are simulated. Your budgets and goals can be changed in Settings or from Edit on the Details page.</p>`;
  $("#detail-dialog").showModal();
});
renderSettings();
renderAuthenticatedProfile();
refreshIcons();
