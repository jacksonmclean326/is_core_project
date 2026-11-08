import { sendFeedback, type FeedbackKind } from "./api.js";
import { refreshIcons } from "./ui/ui.js";

/**
 * The "Send feedback" dialog. Any element with data-open-feedback opens it, on any page. It builds its own
 * <dialog>, so it does not depend on the page having one. A half-written message is kept for the tab, so
 * closing the dialog by accident does not lose it.
 */

const kinds: [FeedbackKind, string][] = [
  ["bug", "Something's broken"],
  ["confusing", "Something's confusing"],
  ["idea", "An idea"],
  ["praise", "Something I like"],
];
const pageNames: Record<string, string> = {
  "/home": "Home",
  "/details": "Details",
  "/accounts": "Accounts",
  "/chat": "Ask",
  "/leaderboard": "Friends",
  "/settings": "Settings",
  "/privacy": "Privacy & data",
  "/help": "Help",
};
const draftKey = "money-man-feedback-draft";
const maxLength = 1000;
const minLength = 5;
const teamEmail = "MoneyMan@MoneyMan.BYU.edu";

interface Draft {
  kind: FeedbackKind;
  message: string;
  contactOk: boolean;
}

let dialog: HTMLDialogElement | null = null;
let opener: Element | null = null;

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

function readDraft(preferredKind?: string): Draft {
  let saved: Partial<Draft> = {};
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
    if (parsed && typeof parsed === "object") saved = parsed as Partial<Draft>;
  } catch {
    // Storage can be blocked; the form simply starts empty.
  }
  const kind = kinds.some(([value]) => value === preferredKind)
    ? (preferredKind as FeedbackKind)
    : kinds.some(([value]) => value === saved.kind)
      ? (saved.kind as FeedbackKind)
      : "idea";
  return { kind, message: typeof saved.message === "string" ? saved.message : "", contactOk: saved.contactOk !== false };
}

function saveDraft(draft: Draft | null): void {
  try {
    if (draft && draft.message.trim()) sessionStorage.setItem(draftKey, JSON.stringify(draft));
    else sessionStorage.removeItem(draftKey);
  } catch {
    // Not worth interrupting anyone over.
  }
}

function currentPage(): string {
  return pageNames[window.location.pathname] ?? "this page";
}

function field<T extends HTMLElement>(selector: string): T {
  const element = dialog?.querySelector<T>(selector);
  if (!element) throw new Error(`Feedback dialog is missing ${selector}.`);
  return element;
}

function formHtml(draft: Draft): string {
  const options = kinds
    .map(
      ([value, label]) =>
        `<label class="fb-kind"><input type="radio" name="kind" value="${value}"${draft.kind === value ? " checked" : ""}><span>${escape(label)}</span></label>`,
    )
    .join("");
  return `<p class="eyebrow">TELL US WHAT YOU THINK</p>
    <h2 class="dialog-title" id="feedback-title">Send feedback</h2>
    <p class="dialog-subtitle">It goes straight to the team. You are on <strong>${escape(currentPage())}</strong>.</p>
    <form id="feedback-form" class="feedback-form" novalidate>
      <fieldset class="fb-kinds"><legend>What kind of feedback is it?</legend>${options}</fieldset>
      <label class="fb-field" for="feedback-message"><span>Your feedback</span>
        <textarea id="feedback-message" rows="5" maxlength="${maxLength}" required placeholder="What happened, or what would make this better?"></textarea>
      </label>
      <p class="fb-count" id="feedback-count" aria-hidden="true"></p>
      <label class="fb-check"><input type="checkbox" id="feedback-contact"${draft.contactOk ? " checked" : ""}> The team can email me about this</label>
      <p class="dialog-form-feedback" id="feedback-error" role="alert"></p>
      <div class="fb-actions">
        <button class="primary-button" type="submit">Send feedback</button>
        <button class="text-button" type="button" data-feedback-close>Cancel</button>
      </div>
    </form>`;
}

function readForm(): Draft {
  const kind = dialog?.querySelector<HTMLInputElement>('input[name="kind"]:checked')?.value;
  return {
    kind: kinds.some(([value]) => value === kind) ? (kind as FeedbackKind) : "idea",
    message: field<HTMLTextAreaElement>("#feedback-message").value,
    contactOk: field<HTMLInputElement>("#feedback-contact").checked,
  };
}

function updateCount(): void {
  const length = field<HTMLTextAreaElement>("#feedback-message").value.length;
  field("#feedback-count").textContent = `${length} / ${maxLength}`;
}

function getDialog(): HTMLDialogElement {
  if (dialog) return dialog;
  const created = document.createElement("dialog");
  created.id = "feedback-dialog";
  created.className = "detail-dialog feedback-dialog";
  created.setAttribute("aria-labelledby", "feedback-title");
  created.innerHTML = `<button class="dialog-close" type="button" aria-label="Close" data-feedback-close><i data-icon="x" aria-hidden="true"></i></button><div id="feedback-content"></div>`;
  document.body.append(created);
  dialog = created;

  created.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target === created || target?.closest("[data-feedback-close]")) created.close();
  });
  created.addEventListener("close", () => {
    if (opener instanceof HTMLElement) opener.focus();
  });
  created.addEventListener("input", () => {
    if (!created.querySelector("#feedback-form")) return;
    updateCount();
    saveDraft(readForm());
  });
  created.addEventListener("change", () => {
    if (created.querySelector("#feedback-form")) saveDraft(readForm());
  });
  created.addEventListener("submit", (event) => {
    event.preventDefault();
    void submit();
  });
  return created;
}

async function submit(): Promise<void> {
  const draft = readForm();
  const error = field("#feedback-error");
  const button = field<HTMLButtonElement>('#feedback-form button[type="submit"]');
  const message = draft.message.replace(/\r\n/g, "\n").trim();
  error.classList.remove("is-error");
  if (message.length < minLength) {
    error.textContent = `Write a little more (at least ${minLength} characters) so the team can act on it.`;
    error.classList.add("is-error");
    field<HTMLTextAreaElement>("#feedback-message").focus();
    return;
  }
  button.disabled = true;
  button.textContent = "Sending…";
  error.textContent = "";
  try {
    await sendFeedback({ kind: draft.kind, message, page: window.location.pathname, contactOk: draft.contactOk });
    saveDraft(null);
    field("#feedback-content").innerHTML = `<div class="fb-thanks"><i data-icon="circle-check" aria-hidden="true"></i><h2 class="dialog-title" id="feedback-title">Thanks, that helps</h2><p>The team reads every message.</p><button class="primary-button" type="button" data-feedback-close>Done</button></div>`;
    refreshIcons();
    field<HTMLButtonElement>(".fb-thanks button").focus();
  } catch (failure) {
    const reason = failure instanceof Error ? failure.message : "Could not send your feedback.";
    error.innerHTML = `${escape(reason)} Your message is saved here, so you can try again or email <a href="mailto:${teamEmail}">${teamEmail}</a>.`;
    error.classList.add("is-error");
    button.disabled = false;
    button.textContent = "Send feedback";
  }
}

/** Opens the dialog. `kind` pre-selects a type, for links like "Report a problem". */
export function openFeedback(kind?: string): void {
  const element = getDialog();
  const draft = readDraft(kind);
  field("#feedback-content").innerHTML = formHtml(draft);
  field<HTMLTextAreaElement>("#feedback-message").value = draft.message;
  updateCount();
  refreshIcons();
  if (!element.open) element.showModal();
  field<HTMLTextAreaElement>("#feedback-message").focus();
}

document.addEventListener("click", (event) => {
  const trigger = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-open-feedback]") : null;
  if (!trigger) return;
  event.preventDefault();
  opener = trigger;
  openFeedback(trigger.dataset.feedbackKind);
});
