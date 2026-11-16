import { onboardingReasons, type OnboardingReason } from "../../../shared/onboarding.js";
import { currencies, currencyOrDefault } from "../../../shared/currencies.js";
import { currentMonthKey } from "../../../shared/months.js";
import {
  completeOnboarding,
  addFriend,
  getAccount,
  getFriendCode,
  getGoals,
  getRates,
  putGoals,
  saveBudget,
  updateAccountCurrency,
  updateAccountPreference,
} from "../../api.js";
import { openPlaidLink } from "../../plaid-link.js";
import { shareFriendInvite } from "../../friend-invite.js";
import { $, displayToUsd, setCurrency, setRates } from "../../core.js";
import type { Goal } from "../../core.js";
import "../../page-navigation.js";

const steps = [...document.querySelectorAll<HTMLElement>(".setup-step")];
const progressItems = [...document.querySelectorAll<HTMLElement>(".setup-progress li")];
const backButton = $<HTMLButtonElement>("#setup-back");
const nextButton = $<HTMLButtonElement>("#setup-next");
const finishButton = $<HTMLButtonElement>("#setup-finish");
const feedback = $("#setup-feedback");
const bankFeedback = $("#bank-feedback");
const friendFeedback = $("#friend-feedback");
const inviteFeedback = $("#invite-feedback");
const friendInput = $<HTMLInputElement>("#friend-code-input");
const skipFriend = $<HTMLInputElement>("#skip-friend");
let currentStep = 0;
let friendCode = "";
let friendAdded = false;
let existingGoals: Goal[] = [];
let ready = false;
let busy = false;

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function setFeedback(target: HTMLElement, text: string, isError = false): void {
  target.textContent = text;
  target.classList.toggle("is-error", isError);
}

function updateCurrencySymbols(code: string): void {
  const symbol = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
  }).formatToParts(0).find((part) => part.type === "currency")?.value ?? code;
  document.querySelectorAll(".currency-symbol").forEach((item) => {
    item.textContent = symbol;
  });
}

function renderStep(): void {
  steps.forEach((step, index) => {
    step.hidden = index !== currentStep;
    progressItems[index]?.setAttribute("aria-current", index === currentStep ? "step" : "false");
  });
  backButton.hidden = currentStep === 0;
  nextButton.hidden = currentStep === steps.length - 1;
  finishButton.hidden = currentStep !== steps.length - 1;
  if (currentStep === 0) $<HTMLInputElement>("#first-goal-name").focus();
  else steps[currentStep]?.querySelector<HTMLElement>("input, select, button")?.focus();
}

function validateStep(): boolean {
  if (currentStep === 0) {
    const reason = document.querySelector<HTMLInputElement>('input[name="reason"]:checked')?.value;
    const name = $<HTMLInputElement>("#first-goal-name").value.trim().replace(/\s+/g, " ");
    const target = Number($<HTMLInputElement>("#first-goal-target").value);
    if (!reason || !onboardingReasons.includes(reason as OnboardingReason)) {
      setFeedback(feedback, "Choose the main reason you want to use Money Man.", true);
      return false;
    }
    if (!name || name.length > 36) {
      setFeedback(feedback, "Give your first goal a name up to 36 characters.", true);
      $<HTMLInputElement>("#first-goal-name").focus();
      return false;
    }
    if (!Number.isFinite(target) || target <= 0) {
      setFeedback(feedback, "Enter a savings target greater than zero.", true);
      $<HTMLInputElement>("#first-goal-target").focus();
      return false;
    }
  }
  if (currentStep === 1) {
    const income = Number($<HTMLInputElement>("#monthly-income").value);
    const budget = Number($<HTMLInputElement>("#monthly-budget").value);
    if (!Number.isFinite(income) || income <= 0 || !Number.isFinite(budget) || budget <= 0) {
      setFeedback(feedback, "Enter a monthly income and budget greater than zero.", true);
      return false;
    }
    if (budget > income) {
      setFeedback(feedback, "Your monthly budget should fit within your income.", true);
      return false;
    }
  }
  setFeedback(feedback, "");
  return true;
}

function moveTo(index: number): void {
  currentStep = Math.max(0, Math.min(steps.length - 1, index));
  setFeedback(feedback, "");
  renderStep();
}

async function loadProfile(): Promise<void> {
  const [user, savedGoals] = await Promise.all([getAccount(), getGoals()]);
  const metadata = user.user_metadata ?? {};
  const referral = metadata.pending_friend_code;
  if (typeof referral === "string" && /^[A-HJ-NP-Z2-9]{6}$/.test(referral)) {
    friendInput.value = referral;
  }
  $<HTMLInputElement>("#sync-toggle").checked = user.daily_sync !== false;
  $<HTMLInputElement>("#reminder-toggle").checked = user.budget_reminders !== false;
  $<HTMLInputElement>("#leaderboard-toggle").checked = user.leaderboard_visibility !== false;
  existingGoals = savedGoals.goals.map((goal) => ({
    id: goal.goal_id,
    kind: goal.goal_type,
    name: goal.goal_name || `${goal.goal_type} goal`,
    target: Number(goal.desired_savings),
    progress: Number(goal.progress ?? goal.amount_savings ?? 0),
    automatic: goal.automatic ?? false,
    note: goal.note ?? null,
    category: goal.category_key ?? null,
    deadline: goal.target_date ? goal.target_date.slice(0, 10) : null,
    steps: goal.steps ?? null,
  }));
  const currency = currencyOrDefault(metadata.currency);
  const currencySelect = $<HTMLSelectElement>("#setup-currency");
  currencySelect.innerHTML = currencies
    .map((item) => `<option value="${item.code}">${item.code} · ${item.name}</option>`)
    .join("");
  currencySelect.value = currency;
  setCurrency(currency);
  if (currency !== "USD") {
    try {
      setRates(await getRates());
    } catch (error) {
      console.error("Could not load the saved display currency's exchange rate.", error);
      currencySelect.value = "USD";
      setCurrency("USD");
      setFeedback(feedback, "Exchange rates are unavailable right now. Setup will use US dollars; you can change this later in Settings.");
    }
  }
  const activeCurrency = currencySelect.value;
  currencySelect.dataset.savedCurrency = activeCurrency;
  updateCurrencySymbols(activeCurrency);
  try {
    friendCode = (await getFriendCode()).friendCode;
    $<HTMLButtonElement>("#share-invite").disabled = false;
  } catch (error) {
    console.error("Could not load a friend code during account setup.", error);
    setFeedback(inviteFeedback, message(error), true);
  }
  ready = true;
  finishButton.disabled = false;
}

async function changeCurrency(): Promise<void> {
  const select = $<HTMLSelectElement>("#setup-currency");
  const previous = select.dataset.savedCurrency ?? "USD";
  select.disabled = true;
  try {
    if (select.value !== "USD") setRates(await getRates());
    setCurrency(select.value);
    select.dataset.savedCurrency = select.value;
    updateCurrencySymbols(select.value);
    setFeedback(feedback, "");
  } catch (error) {
    select.value = previous;
    setFeedback(feedback, `Could not load that currency’s exchange rate. ${message(error)}`, true);
  } finally {
    select.disabled = false;
  }
}

async function connectBank(): Promise<void> {
  const button = $<HTMLButtonElement>("#connect-bank");
  const plaid = $<HTMLInputElement>('input[name="entry-mode"][value="plaid"]');
  button.disabled = true;
  plaid.checked = true;
  setFeedback(bankFeedback, "Opening secure bank connection…");
  try {
    const connected = await openPlaidLink((status) => setFeedback(bankFeedback, status));
    if (!connected) setFeedback(bankFeedback, "No bank was connected. You can try again or choose manual entry.");
  } catch (error) {
    setFeedback(bankFeedback, message(error), true);
  } finally {
    button.disabled = false;
  }
}

async function addFirstFriend(): Promise<void> {
  const code = friendInput.value.trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
    setFeedback(friendFeedback, "Enter a valid six-character friend code.", true);
    return;
  }
  const button = $<HTMLButtonElement>("#add-first-friend");
  button.disabled = true;
  setFeedback(friendFeedback, "Adding friend…");
  try {
    await addFriend(code);
    friendAdded = true;
    friendInput.value = code;
    skipFriend.checked = false;
    setFeedback(friendFeedback, "Friend added to both of your circles.");
  } catch (error) {
    setFeedback(friendFeedback, message(error), true);
  } finally {
    button.disabled = false;
  }
}

async function finishSetup(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (!ready || busy || !validateStep()) return;
  const reason = document.querySelector<HTMLInputElement>('input[name="reason"]:checked')?.value;
  const name = $<HTMLInputElement>("#first-goal-name").value.trim().replace(/\s+/g, " ");
  const target = displayToUsd(Number($<HTMLInputElement>("#first-goal-target").value));
  const income = displayToUsd(Number($<HTMLInputElement>("#monthly-income").value));
  const budget = displayToUsd(Number($<HTMLInputElement>("#monthly-budget").value));
  const entryMode = document.querySelector<HTMLInputElement>('input[name="entry-mode"]:checked')?.value;
  const friendCodeToAdd = skipFriend.checked ? "" : friendInput.value.trim().toUpperCase();
  if (!reason || !entryMode || (entryMode !== "plaid" && entryMode !== "manual")) {
    setFeedback(feedback, "Complete each setup choice before finishing.", true);
    return;
  }
  if (friendCodeToAdd && !/^[A-HJ-NP-Z2-9]{6}$/.test(friendCodeToAdd)) {
    moveTo(4);
    setFeedback(friendFeedback, "Enter a valid six-character friend code, or choose to add friends later.", true);
    return;
  }

  busy = true;
  finishButton.disabled = true;
  backButton.disabled = true;
  setFeedback(feedback, "Saving your account setup…");
  try {
    const currency = $<HTMLSelectElement>("#setup-currency").value;
    await updateAccountCurrency(currency);
    await saveBudget({ month: currentMonthKey(), monthlyIncome: income, monthlyBudget: budget });
    if (existingGoals.length === 0) {
      const firstGoal: Goal = {
        id: crypto.randomUUID(),
        kind: "Savings",
        name,
        target,
        progress: 0,
        automatic: false,
        note: null,
        category: null,
        deadline: null,
        steps: null,
      };
      await putGoals([{
        id: firstGoal.id,
        kind: firstGoal.kind,
        name: firstGoal.name,
        target: firstGoal.target,
        category: null,
        deadline: null,
        progress: 0,
        steps: null,
      }]);
      existingGoals = [firstGoal];
    }
    await Promise.all([
      updateAccountPreference("daily_sync", $<HTMLInputElement>("#sync-toggle").checked),
      updateAccountPreference("budget_reminders", $<HTMLInputElement>("#reminder-toggle").checked),
      updateAccountPreference("leaderboard_visibility", $<HTMLInputElement>("#leaderboard-toggle").checked),
    ]);
    if (friendCodeToAdd && !friendAdded) {
      try {
        await addFriend(friendCodeToAdd);
      } catch (error) {
        if (!(error instanceof Error) || !/already friends/i.test(error.message)) throw error;
      }
    }
    await completeOnboarding(reason, entryMode);
    window.location.assign("/home");
  } catch (error) {
    setFeedback(feedback, `Setup could not be completed. ${message(error)} Your saved steps are kept; review the friend option and try again.`, true);
    finishButton.disabled = false;
    backButton.disabled = false;
    busy = false;
  }
}

nextButton.addEventListener("click", () => {
  if (validateStep()) moveTo(currentStep + 1);
});
backButton.addEventListener("click", () => moveTo(currentStep - 1));
$<HTMLFormElement>("#setup-form").addEventListener("submit", (event) => {
  if (currentStep < steps.length - 1) {
    event.preventDefault();
    if (validateStep()) moveTo(currentStep + 1);
    return;
  }
  void finishSetup(event);
});
$<HTMLSelectElement>("#setup-currency").addEventListener("change", () => {
  void changeCurrency();
});
$<HTMLButtonElement>("#connect-bank").addEventListener("click", () => {
  void connectBank();
});
$<HTMLButtonElement>("#add-first-friend").addEventListener("click", () => {
  void addFirstFriend();
});
friendInput.addEventListener("input", () => {
  friendAdded = false;
  skipFriend.checked = false;
});
skipFriend.addEventListener("change", () => {
  if (skipFriend.checked) {
    friendInput.value = "";
    friendAdded = false;
    setFeedback(friendFeedback, "");
  }
});
$<HTMLButtonElement>("#share-invite").addEventListener("click", async () => {
  if (!friendCode) return;
  try {
    const result = await shareFriendInvite(friendCode);
    setFeedback(inviteFeedback, result === "shared"
      ? "Invite link shared."
      : result === "copied"
        ? "Invite link copied. Your friend can create an account and be added to your circle."
        : result === "cancelled"
          ? "Invite sharing cancelled."
          : `Copy this invite link: ${result}`);
  } catch (error) {
    setFeedback(inviteFeedback, message(error), true);
  }
});

finishButton.disabled = true;
renderStep();
void loadProfile().catch((error: unknown) => {
  console.error("Could not load account data for setup.", error);
  setFeedback(feedback, `Could not load your account setup. ${message(error)} Refresh to try again.`, true);
});
