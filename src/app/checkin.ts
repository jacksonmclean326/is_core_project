import { getCheckIn, sendCheckIn } from "./api.js";
import { displayToUsd, shownCurrency } from "./state/state.js";
import { refreshIcons } from "./ui/ui.js";
import { currencySymbol } from "../shared/currencies.js";

/**
 * OKR 4: the two-month savings check-in. 60 days after sign-up, one question appears on whichever page the person
 * opens: "Have you saved money since you started using Money Man?". Answering hides it for good; "Not now" (or
 * closing it) hides it for a week. The team can open it any time from /admin with `openCheckIn({ demo: true })`,
 * which never snoozes.
 */

const checkedKey = "money-man-checkin-checked";

let dialog: HTMLDialogElement | null = null;
let answered = false;
let demo = false;
let onDone: (() => void) | null = null;

function field<T extends HTMLElement>(selector: string): T {
  const element = dialog?.querySelector<T>(selector);
  if (!element) throw new Error(`Check-in dialog is missing ${selector}.`);
  return element;
}

function formHtml(): string {
  return `<p class="eyebrow">TWO-MONTH CHECK-IN</p>
    <h2 class="dialog-title" id="checkin-title">Have you saved money since you started using Money Man?</h2>
    <p class="dialog-subtitle">One quick question. Your answer helps the team see if the app is really helping.</p>
    <form id="checkin-form" class="feedback-form checkin-form" novalidate>
      <fieldset class="fb-kinds"><legend>Your answer</legend>
        <label class="fb-kind"><input type="radio" name="saved" value="yes"><span>Yes, I have</span></label>
        <label class="fb-kind"><input type="radio" name="saved" value="no"><span>Not yet</span></label>
      </fieldset>
      <label class="fb-field checkin-amount" for="checkin-amount" hidden><span>About how much have you saved? (optional)</span>
        <input id="checkin-amount" type="number" inputmode="decimal" min="0" step="any" placeholder="${currencySymbol(shownCurrency())}250" />
      </label>
      <p class="dialog-form-feedback" id="checkin-error" role="alert"></p>
      <div class="fb-actions">
        <button class="primary-button" type="submit">Send answer</button>
        <button class="text-button" type="button" data-checkin-close>Not now</button>
      </div>
    </form>`;
}

function getDialog(): HTMLDialogElement {
  if (dialog) return dialog;
  const created = document.createElement("dialog");
  created.id = "checkin-dialog";
  created.className = "detail-dialog feedback-dialog checkin-dialog";
  created.setAttribute("aria-labelledby", "checkin-title");
  created.innerHTML = `<button class="dialog-close" type="button" aria-label="Close" data-checkin-close><i data-icon="x" aria-hidden="true"></i></button><div id="checkin-content"></div>`;
  document.body.append(created);
  dialog = created;

  created.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target === created || target?.closest("[data-checkin-close]")) created.close();
  });
  created.addEventListener("change", () => {
    const yes = created.querySelector<HTMLInputElement>('input[name="saved"][value="yes"]')?.checked ?? false;
    const amount = created.querySelector<HTMLElement>(".checkin-amount");
    if (amount) amount.hidden = !yes;
  });
  created.addEventListener("submit", (event) => {
    event.preventDefault();
    void submit();
  });
  created.addEventListener("close", () => {
    // Closing without answering counts as "Not now", so it does not come back on every page.
    if (!answered && !demo) void sendCheckIn({ later: true }).catch(() => undefined);
    onDone?.();
    onDone = null;
  });
  return created;
}

async function submit(): Promise<void> {
  const choice = dialog?.querySelector<HTMLInputElement>('input[name="saved"]:checked')?.value;
  const error = field("#checkin-error");
  error.classList.remove("is-error");
  if (choice !== "yes" && choice !== "no") {
    error.textContent = "Choose Yes or Not yet.";
    error.classList.add("is-error");
    return;
  }
  let amount: number | null = null;
  const typed = field<HTMLInputElement>("#checkin-amount").value.trim();
  if (choice === "yes" && typed) {
    const shown = Number(typed);
    if (!Number.isFinite(shown) || shown < 0) {
      error.textContent = "Enter an amount of zero or more, or leave it blank.";
      error.classList.add("is-error");
      return;
    }
    amount = displayToUsd(shown);
  }
  const button = field<HTMLButtonElement>('#checkin-form button[type="submit"]');
  button.disabled = true;
  button.textContent = "Sending…";
  error.textContent = "";
  try {
    await sendCheckIn({ saved: choice === "yes", amount });
    answered = true;
    field("#checkin-content").innerHTML = `<div class="fb-thanks"><i data-icon="circle-check" aria-hidden="true"></i><h2 class="dialog-title" id="checkin-title">${
      choice === "yes" ? "Nice work!" : "Thanks for telling us"
    }</h2><p>${
      choice === "yes" ? "Keep it up. Your goals on Details help you stay on track." : "Setting a Savings goal on Details is a good place to start."
    }</p><button class="primary-button" type="button" data-checkin-close>Done</button></div>`;
    refreshIcons();
    field<HTMLButtonElement>(".fb-thanks button").focus();
  } catch (failure) {
    error.textContent = failure instanceof Error ? failure.message : "Could not send your answer.";
    error.classList.add("is-error");
    button.disabled = false;
    button.textContent = "Send answer";
  }
}

/** Shows the check-in. With `demo`, closing it does not hide it for a week (for the team's /admin page). */
export function openCheckIn(options: { demo?: boolean; onClose?: () => void } = {}): void {
  const element = getDialog();
  answered = false;
  demo = Boolean(options.demo);
  onDone = options.onClose ?? null;
  field("#checkin-content").innerHTML = formHtml();
  refreshIcons();
  if (!element.open) element.showModal();
  field<HTMLInputElement>('input[name="saved"]').focus();
}

/** Asks the server once per tab per day whether the check-in is due, and shows it if so. */
export async function maybeShowCheckIn(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (sessionStorage.getItem(checkedKey) === today) return;
  } catch {
    // Storage can be blocked; ask the server instead.
  }
  try {
    const status = await getCheckIn();
    if (!status.due) {
      try {
        sessionStorage.setItem(checkedKey, today);
      } catch {
        // Not worth interrupting anyone over.
      }
      return;
    }
    // Do not stack on top of another open dialog.
    if (document.querySelector("dialog[open]")) return;
    openCheckIn();
  } catch (error) {
    console.error("Unable to load the savings check-in.", error);
  }
}
