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
  $(".profile-row > div strong").textContent = state.profile.name;
  $(".profile-row > div > span").textContent = state.profile.email;
  $(".profile-button .profile-initials").textContent = state.profile.name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  $(".large-initials").textContent = $(
    ".profile-button .profile-initials",
  ).textContent;
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

$("#edit-profile").addEventListener("click", () => {
  $("#dialog-content").innerHTML =
    `<p class="eyebrow">YOUR ACCOUNT</p><h2 class="dialog-title">Edit account details</h2><p class="dialog-subtitle">Update the name shown in your friend circle.</p><form id="profile-edit-form" class="profile-edit-form"><label for="profile-name">Name</label><input id="profile-name" maxlength="50" value="${escapeHTML(state.profile.name)}" required><label for="profile-email">Email</label><input id="profile-email" type="email" value="${escapeHTML(state.profile.email)}" required><button class="primary-button" type="submit">Save details</button></form>`;
  $("#detail-dialog").showModal();
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
$("#detail-dialog").addEventListener("submit", (event) => {
  if (event.target.id !== "profile-edit-form") return;
  event.preventDefault();
  state.profile.name = $("#profile-name").value.trim() || state.profile.name;
  state.profile.email = $("#profile-email").value.trim() || state.profile.email;
  saveState();
  $("#detail-dialog").close();
  renderSettings();
  showToast("Your account details are saved.");
});

renderSettings();
refreshIcons();
