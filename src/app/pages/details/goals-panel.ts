import { $, displayToUsd, escapeHTML, eventElement, refreshIcons, shownCurrency, showToast, state, toInputValue } from "../../core.js";
import type { Goal } from "../../core.js";
import { saveGoals } from "../../goals.js";
import { currencySymbol } from "../../../shared/currencies.js";
import { maxChecklistSteps, maxStepLength, type GoalStep } from "../../../shared/goal-progress.js";

/**
 * The Goals panel on Details: a list where each goal is edited in place, like the Categories panel. A change
 * saves when you leave the box (or pick from a menu), so there is no Save button. It replaces the old
 * "Edit your goals" dialog and keeps everything it could do: every goal type, a category for spending
 * limits, saved-so-far and a deadline for manual goals, and steps for checklist goals.
 */

interface Options {
  /** Redraw the goal cards after goals changed. */
  onChange(): void;
}

const maxNameLength = 36;
const kindOptions: [string, string][] = [
  ["Savings", "Savings (auto)"],
  ["Spending", "Spending (auto)"],
  ["Earnings", "Earnings"],
  ["Investing", "Investing"],
  ["Custom", "Custom"],
  ["Checklist", "Checklist"],
];
const kindHints: Record<string, string> = {
  Savings: "Tracks this month's income minus spending. Set your income in Settings.",
  Spending: "Tracks this month's spending against the limit.",
};

let options: Options | null = null;
let confirmDeleteId: string | null = null;
/** Saves run one at a time, so two quick edits cannot overwrite each other. */
let queue: Promise<unknown> = Promise.resolve();

const panel = () => $("#goals-panel");
const isManual = (kind: string) => kind !== "Savings" && kind !== "Spending";
const symbol = () => escapeHTML(currencySymbol(shownCurrency()));

function kindSelect(kind: string, label: string, className: string): string {
  const choices = kindOptions
    .map(([value, text]) => `<option value="${value}"${value === kind ? " selected" : ""}>${text}</option>`)
    .join("");
  return `<select class="${className}" aria-label="${escapeHTML(label)}">${choices}</select>`;
}

function categorySelect(selected: string | null, name: string): string {
  const choices = [
    `<option value="">All spending</option>`,
    ...state.categories.map(
      (category) =>
        `<option value="${escapeHTML(category.id)}"${selected === category.id ? " selected" : ""}>${escapeHTML(category.name)}</option>`,
    ),
  ].join("");
  return `<select class="gp-category" aria-label="What the limit for ${escapeHTML(name)} applies to">${choices}</select>`;
}

const stepsText = (goal: Goal) => (goal.steps ?? []).map((step) => step.text).join("\n");

function rowHtml(goal: Goal): string {
  const name = escapeHTML(goal.name);
  const confirming = confirmDeleteId === goal.id;
  const categoryColor = goal.kind === "Spending" && goal.category ? state.categories.find((item) => item.id === goal.category)?.color : undefined;
  const style = categoryColor ? ` style="--c:${escapeHTML(categoryColor)}"` : "";
  const action = confirming
    ? `<span class="cat-confirm"><span>Delete this goal?</span><button type="button" class="cat-danger" data-confirm-delete-goal="${escapeHTML(goal.id)}">Delete</button><button type="button" class="cat-cancel" data-cancel-delete-goal>Cancel</button></span>`
    : `<button type="button" class="cat-delete" data-delete-goal="${escapeHTML(goal.id)}" aria-label="Delete ${name}">Delete</button>`;
  const amount = goal.kind === "Checklist" ? "" : toInputValue(goal.target);
  const saved = isManual(goal.kind) && goal.kind !== "Checklist" ? toInputValue(goal.progress) : "";
  return `<div class="gp-row${confirming ? " is-confirming" : ""}" role="listitem" data-goal="${escapeHTML(goal.id)}" data-kind="${escapeHTML(goal.kind)}"${style}>
    ${kindSelect(goal.kind, `Type of ${goal.name}`, "gp-kind")}
    <input class="cat-name gp-name" value="${name}" maxlength="${maxNameLength}" aria-label="Name of ${name}" autocomplete="off">
    <label class="cat-limit gp-amount"><span class="cat-symbol" aria-hidden="true">${symbol()}</span><input class="cat-limit-input gp-target" inputmode="decimal" placeholder="Amount" value="${escapeHTML(amount)}" aria-label="Goal amount for ${name}" autocomplete="off"></label>
    ${action}
    <div class="gp-extra">
      <p class="gp-hint">${escapeHTML(kindHints[goal.kind] ?? "")}</p>
      <label class="gp-field gp-only-spending">Applies to ${categorySelect(goal.category ?? null, goal.name)}</label>
      <label class="gp-field gp-only-money">Saved so far <span class="gp-money"><span aria-hidden="true">${symbol()}</span><input class="gp-progress" inputmode="decimal" placeholder="0" value="${escapeHTML(saved)}" autocomplete="off"></span></label>
      <label class="gp-field gp-only-manual">Deadline (optional) <input class="gp-deadline" type="date" value="${escapeHTML(goal.deadline ?? "")}"></label>
      <label class="gp-field gp-only-checklist gp-steps-field">Steps, one per line <textarea class="gp-steps" rows="3" maxlength="1700" placeholder="Open a savings account&#10;Set up an automatic transfer">${escapeHTML(stepsText(goal))}</textarea></label>
    </div>
    <p class="cat-message" role="status" aria-live="polite"></p>
  </div>`;
}

function addFormHtml(): string {
  return `<form class="cat-add gp-add" id="goal-add-form" data-kind="Savings" novalidate>
    <h3>Add a goal</h3>
    <div class="cat-add-fields">
      ${kindSelect("Savings", "Type of the new goal", "gp-new-kind")}
      <input id="gp-new-name" maxlength="${maxNameLength}" placeholder="Name your goal" aria-label="Name of the new goal" autocomplete="off">
      <label class="cat-limit gp-new-amount"><span class="cat-symbol" aria-hidden="true">${symbol()}</span><input id="gp-new-target" class="cat-limit-input" inputmode="decimal" placeholder="Amount" aria-label="Goal amount" autocomplete="off"></label>
      <button class="primary-button" type="submit">Add</button>
    </div>
    <label class="gp-field gp-new-steps">Steps, one per line <textarea id="gp-new-steps" rows="3" maxlength="1700" placeholder="Open a savings account&#10;Set up an automatic transfer"></textarea></label>
    <p class="cat-add-note">Savings and Spending goals update on their own each month. Earnings, Investing, and Custom goals have an amount you update. A Checklist is steps you tick off on the goal card.</p>
    <p class="cat-add-error" role="alert"></p>
  </form>`;
}

function render(): void {
  $("#goal-rows").innerHTML = state.goals.length
    ? state.goals.map(rowHtml).join("")
    : `<p class="gp-empty">No goals yet. Add one below.</p>`;
  $("#goal-add").innerHTML = addFormHtml();
  refreshIcons();
}

const rowOf = (element: Element | null) => element?.closest<HTMLElement>(".gp-row") ?? null;
const goalOf = (row: HTMLElement | null) => state.goals.find((goal) => goal.id === row?.dataset.goal);

let messageTimer: ReturnType<typeof setTimeout> | undefined;
function say(row: HTMLElement, text: string, isError = false): void {
  const message = row.querySelector<HTMLElement>(".cat-message");
  if (!message) return;
  message.textContent = text;
  message.classList.toggle("is-error", isError);
  clearTimeout(messageTimer);
  if (!isError) messageTimer = setTimeout(() => (message.textContent = ""), 2200);
}

/** A typed amount in the display currency, as dollars. Keeps `stored` when the box still shows it, so nothing drifts. */
function amountFrom(text: string, stored: number): number | null {
  const cleaned = text.replace(/[,\s]/g, "").replace(/^\p{Sc}+|\p{Sc}+$/gu, "");
  if (cleaned === toInputValue(stored)) return stored;
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? displayToUsd(value) : null;
}

/** Turns "one per line" text into steps, keeping a step's tick when its text did not change. */
function stepsFrom(text: string, previous: GoalStep[] | null | undefined): GoalStep[] | string {
  const done = new Map((previous ?? []).map((step) => [step.text.toLowerCase(), step.done]));
  const steps = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((line) => ({ text: line, done: done.get(line.toLowerCase()) ?? false }));
  if (!steps.length) return "Add at least one step, one per line.";
  if (steps.length > maxChecklistSteps) return `A checklist can have up to ${maxChecklistSteps} steps.`;
  if (steps.some((step) => step.text.length > maxStepLength || /[<>]/.test(step.text))) {
    return `Steps can be up to ${maxStepLength} characters and cannot contain < or >.`;
  }
  return steps;
}

function nameProblem(name: string): string | null {
  if (!name) return "Give the goal a name.";
  if (name.length > maxNameLength || /[<>]/.test(name)) return `Names can be up to ${maxNameLength} characters and cannot contain < or >.`;
  return null;
}

/** Reads a row into a goal, or returns what is wrong with it. */
function goalFromRow(row: HTMLElement, old: Goal): Goal | string {
  const field = <T extends HTMLElement>(selector: string) => row.querySelector<T>(selector)!;
  const kind = field<HTMLSelectElement>(".gp-kind").value;
  const name = field<HTMLInputElement>(".gp-name").value.replace(/\s+/g, " ").trim();
  const problem = nameProblem(name);
  if (problem) return problem;

  let target: number;
  let progress = 0;
  let steps: GoalStep[] | null = null;
  if (kind === "Checklist") {
    const parsed = stepsFrom(field<HTMLTextAreaElement>(".gp-steps").value, old.steps);
    if (typeof parsed === "string") return parsed;
    steps = parsed;
    target = steps.length;
    progress = steps.filter((step) => step.done).length;
  } else {
    const parsed = amountFrom(field<HTMLInputElement>(".gp-target").value, old.kind === "Checklist" ? NaN : old.target);
    if (parsed === null || parsed <= 0) return "Enter an amount more than zero.";
    target = parsed;
    if (isManual(kind)) {
      const typed = field<HTMLInputElement>(".gp-progress").value;
      const saved = typed.trim() ? amountFrom(typed, isManual(old.kind) && old.kind !== "Checklist" ? old.progress : NaN) : 0;
      if (saved === null || saved < 0) return "Saved so far must be zero or more.";
      progress = saved;
    }
  }
  return {
    ...old,
    kind,
    name,
    target,
    progress,
    category: kind === "Spending" ? field<HTMLSelectElement>(".gp-category").value || null : null,
    deadline: isManual(kind) ? field<HTMLInputElement>(".gp-deadline").value || null : null,
    steps,
  };
}

/** Saves the whole list with `change` applied. Resolves to the saved goals, or throws. */
function persist(change: (goals: Goal[]) => Goal[]): Promise<Goal[]> {
  const run = queue.then(async () => {
    const saved = await saveGoals(change(state.goals));
    state.goals = saved;
    options?.onChange();
    return saved;
  });
  queue = run.catch(() => undefined);
  return run;
}

function sameGoal(a: Goal, b: Goal): boolean {
  return (
    a.kind === b.kind &&
    a.name === b.name &&
    a.target === b.target &&
    (!isManual(b.kind) || a.progress === b.progress) && // automatic progress is worked out, not typed

    (a.category ?? null) === (b.category ?? null) &&
    (a.deadline ?? null) === (b.deadline ?? null) &&
    JSON.stringify(a.steps ?? null) === JSON.stringify(b.steps ?? null)
  );
}

async function commitRow(row: HTMLElement): Promise<void> {
  const old = goalOf(row);
  if (!old) return;
  const next = goalFromRow(row, old);
  if (typeof next === "string") {
    say(row, next, true);
    return;
  }
  if (sameGoal(old, next)) {
    say(row, "");
    return;
  }
  try {
    const saved = await persist((goals) => goals.map((goal) => (goal.id === old.id ? next : goal)));
    const updated = saved.find((goal) => goal.id === old.id);
    // Show what the server worked out (rounded steps, automatic progress) without moving the cursor.
    if (updated && row.isConnected) {
      row.dataset.kind = updated.kind;
      const color = updated.kind === "Spending" && updated.category ? state.categories.find((item) => item.id === updated.category)?.color : undefined;
      if (color) row.style.setProperty("--c", color);
      else row.style.removeProperty("--c");
      const hint = row.querySelector<HTMLElement>(".gp-hint");
      if (hint) hint.textContent = kindHints[updated.kind] ?? "";
    }
    say(row, "Saved");
  } catch (error) {
    say(row, `Not saved. ${error instanceof Error ? error.message : "Check your connection and try again."}`, true);
  }
}

async function addGoal(form: HTMLFormElement): Promise<void> {
  const error = form.querySelector<HTMLElement>(".cat-add-error")!;
  const kind = form.querySelector<HTMLSelectElement>(".gp-new-kind")!.value;
  const nameInput = form.querySelector<HTMLInputElement>("#gp-new-name")!;
  const name = nameInput.value.replace(/\s+/g, " ").trim();
  const fail = (text: string, focus: HTMLElement) => {
    error.textContent = text;
    focus.focus();
  };
  const problem = nameProblem(name);
  if (problem) return fail(problem, nameInput);

  let target: number;
  let steps: GoalStep[] | null = null;
  if (kind === "Checklist") {
    const box = form.querySelector<HTMLTextAreaElement>("#gp-new-steps")!;
    const parsed = stepsFrom(box.value, null);
    if (typeof parsed === "string") return fail(parsed, box);
    steps = parsed;
    target = steps.length;
  } else {
    const box = form.querySelector<HTMLInputElement>("#gp-new-target")!;
    const parsed = amountFrom(box.value, NaN);
    if (parsed === null || parsed <= 0) return fail("Enter an amount more than zero.", box);
    target = parsed;
  }
  error.textContent = "";
  const goal: Goal = { id: crypto.randomUUID(), kind, name, target, progress: 0, automatic: false, note: null, category: null, deadline: null, steps };
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  try {
    await persist((goals) => [...goals, goal]);
    render();
    $<HTMLInputElement>("#gp-new-name").focus();
    showToast(`Added ${name}.`);
  } catch (failure) {
    error.textContent = `Not added. ${failure instanceof Error ? failure.message : "Check your connection and try again."}`;
    button.disabled = false;
  }
}

async function deleteGoal(id: string): Promise<void> {
  const goal = state.goals.find((item) => item.id === id);
  if (!goal) return;
  try {
    await persist((goals) => goals.filter((item) => item.id !== id));
    confirmDeleteId = null;
    render();
    showToast(`Deleted ${goal.name}.`);
  } catch (failure) {
    confirmDeleteId = null;
    render();
    const row = $("#goal-rows").querySelector<HTMLElement>(`[data-goal="${id}"]`);
    if (row) say(row, failure instanceof Error ? failure.message : "Could not delete that. Please try again.", true);
  }
}

export function openGoalsPanel(): void {
  const element = panel();
  element.hidden = false;
  $("#edit-goals-link").setAttribute("aria-expanded", "true");
  confirmDeleteId = null;
  render();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  element.querySelector<HTMLElement>(".gp-name, #gp-new-name")?.focus({ preventScroll: true });
}

function closePanel(): void {
  panel().hidden = true;
  const button = $("#edit-goals-link");
  button.setAttribute("aria-expanded", "false");
  button.focus();
}

export function initGoalsPanel(settings: Options): void {
  options = settings;
  const element = panel();

  $("#edit-goals-link").addEventListener("click", () => (element.hidden ? openGoalsPanel() : closePanel()));
  $("#goals-done").addEventListener("click", closePanel);

  element.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const form = target.closest<HTMLFormElement>("#goal-add-form");
    if (form) {
      if (target.classList.contains("gp-new-kind")) form.dataset.kind = (target as HTMLSelectElement).value;
      return;
    }
    const row = rowOf(target);
    if (!row) return;
    if (target.classList.contains("gp-kind")) {
      const kind = (target as HTMLSelectElement).value;
      row.dataset.kind = kind;
      const hint = row.querySelector<HTMLElement>(".gp-hint");
      if (hint) hint.textContent = kindHints[kind] ?? "";
      // Switching to a checklist needs steps first; switching from one needs an amount. Ask, then save once filled.
      const needs =
        kind === "Checklist" && !row.querySelector<HTMLTextAreaElement>(".gp-steps")!.value.trim()
          ? ".gp-steps"
          : kind !== "Checklist" && !row.querySelector<HTMLInputElement>(".gp-target")!.value.trim()
            ? ".gp-target"
            : null;
      if (needs) {
        say(row, kind === "Checklist" ? "Add the steps to save this change." : "Add an amount to save this change.", true);
        row.querySelector<HTMLElement>(needs)?.focus();
        return;
      }
    }
    void commitRow(row);
  });

  element.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !rowOf(target) || target.type === "date") return;
    if (event.key === "Enter") {
      event.preventDefault();
      target.blur(); // leaving the box saves it
    } else if (event.key === "Escape") {
      // Put the whole row back the way it was saved.
      const row = rowOf(target)!;
      const goal = goalOf(row);
      if (goal) row.outerHTML = rowHtml(goal);
    }
  });

  element.addEventListener("click", (event) => {
    const target = eventElement(event);
    const del = target?.closest<HTMLElement>("[data-delete-goal]");
    if (del?.dataset.deleteGoal) {
      confirmDeleteId = del.dataset.deleteGoal;
      render();
      $("#goal-rows").querySelector<HTMLElement>(".is-confirming .cat-danger")?.focus();
      return;
    }
    const confirm = target?.closest<HTMLElement>("[data-confirm-delete-goal]");
    if (confirm?.dataset.confirmDeleteGoal) {
      void deleteGoal(confirm.dataset.confirmDeleteGoal);
      return;
    }
    if (target?.closest("[data-cancel-delete-goal]")) {
      confirmDeleteId = null;
      render();
    }
  });

  element.addEventListener("submit", (event) => {
    if (event.target instanceof HTMLFormElement && event.target.id === "goal-add-form") {
      event.preventDefault();
      void addGoal(event.target);
    }
  });
}
