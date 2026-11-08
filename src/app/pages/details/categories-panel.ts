import {
  $,
  displayToUsd,
  escapeHTML,
  eventElement,
  loadLinkedTransactions,
  money,
  refreshIcons,
  saveState,
  shownCurrency,
  showToast,
  state,
  syncCustomCategories,
  toInputValue,
} from "../../core.js";
import { createCategory, deleteCategory, renameCategory } from "../../api.js";
import { currencySymbol } from "../../../shared/currencies.js";
import { customCategoryColors, maxCategoryNameLength, maxCustomCategories } from "../../../shared/category-colors.js";
import { parseLimit, totalLimits } from "../../../shared/limits.js";
import type { MonthKey } from "../../../shared/months.js";

/**
 * The Categories panel on Details: a list where each row is edited in place. Every change saves as soon as it
 * is made (a name or limit when you leave the box, a switch when you flip it), so there is no Save button and
 * nothing to lose. It replaces the old "Edit categories" dialog.
 */

interface Options {
  /** Redraw the page's charts and lists after a category changed. */
  onChange(): void;
  /** The month being viewed, so deleting a category can reload it. */
  month(): MonthKey;
}

let options: Options | null = null;
let confirmDeleteId: string | null = null;

const panel = () => $("#categories-panel");
const customCount = () => state.categories.filter((category) => category.custom).length;

function nextFreeColor(): string {
  const used = new Set(state.categories.filter((category) => category.custom).map((category) => category.color.toLowerCase()));
  return customCategoryColors.find((color) => !used.has(color.value))?.value ?? customCategoryColors[0]!.value;
}

/** Validates a name another category does not already have. Returns an error message, or null if it is fine. */
function nameProblem(name: string, ignoreId?: string): string | null {
  if (!name) return "Give the category a name.";
  if (name.length > maxCategoryNameLength || /[<>]/.test(name)) {
    return `Names can be up to ${maxCategoryNameLength} characters and cannot contain < or >.`;
  }
  const taken = state.categories.some((category) => category.id !== ignoreId && category.name.toLowerCase() === name.toLowerCase());
  return taken ? `You already have a category called "${name}".` : null;
}

function rowHtml(category: (typeof state.categories)[number]): string {
  const name = escapeHTML(category.name);
  const limit = Number(category.limit) > 0 ? toInputValue(category.limit) : "";
  const confirming = confirmDeleteId === category.id;
  const action = !category.custom
    ? ""
    : confirming
      ? `<span class="cat-confirm"><span>Delete it and move its transactions to Other?</span><button type="button" class="cat-danger" data-confirm-delete="${escapeHTML(category.id)}">Delete</button><button type="button" class="cat-cancel" data-cancel-delete>Cancel</button></span>`
      : `<button type="button" class="cat-delete" data-delete-category="${escapeHTML(category.id)}" aria-label="Delete ${name}">Delete</button>`;
  return `<div class="cat-row${confirming ? " is-confirming" : ""}" role="listitem" data-category="${escapeHTML(category.id)}" style="--c:${escapeHTML(category.color)}">
    <label class="cat-switch"><input type="checkbox" class="cat-visible"${category.visible ? " checked" : ""} aria-label="Show ${name} on the chart"><span aria-hidden="true"></span></label>
    <input class="cat-name" value="${name}" maxlength="${maxCategoryNameLength}" aria-label="Name of ${name}" autocomplete="off">
    <label class="cat-limit"><span class="cat-symbol" aria-hidden="true">${escapeHTML(currencySymbol(shownCurrency()))}</span><input class="cat-limit-input" inputmode="decimal" placeholder="No limit" value="${escapeHTML(limit)}" aria-label="Monthly limit for ${name}" autocomplete="off"></label>
    ${action}
    <p class="cat-message" role="status" aria-live="polite"></p>
  </div>`;
}

function addFormHtml(): string {
  const full = customCount() >= maxCustomCategories;
  const used = new Set(state.categories.filter((category) => category.custom).map((category) => category.color.toLowerCase()));
  const chosen = nextFreeColor();
  const swatches = customCategoryColors
    .map((color) => {
      const taken = used.has(color.value);
      return `<label class="cat-color${taken ? " is-taken" : ""}" title="${escapeHTML(taken ? `${color.name} (already used)` : color.name)}"><input type="radio" name="cat-color" value="${color.value}"${color.value === chosen ? " checked" : ""}${taken || full ? " disabled" : ""}><span style="--c:${color.value}"><i class="sr-only">${escapeHTML(color.name)}</i></span></label>`;
    })
    .join("");
  return `<form class="cat-add" id="category-add-form" novalidate>
    <h3>Add a category</h3>
    <div class="cat-add-fields">
      <label class="sr-only" for="cat-new-name">Name of the new category</label>
      <input id="cat-new-name" maxlength="${maxCategoryNameLength}" placeholder="Name your category" autocomplete="off"${full ? " disabled" : ""}>
      <fieldset class="cat-colors"><legend class="sr-only">Color</legend>${swatches}</fieldset>
      <button class="primary-button" type="submit"${full ? " disabled" : ""}>Add</button>
    </div>
    <p class="cat-add-note">${customCount()} of ${maxCustomCategories} of your own categories${full ? ". Delete one to add another." : "."}</p>
    <p class="cat-add-error" role="alert"></p>
  </form>`;
}

/** "Your limits add up to $X of your $Y budget." */
function updateLimitsNote(): void {
  const note = document.querySelector<HTMLElement>("#limits-note");
  if (!note) return;
  const total = totalLimits(state.categories.map((category) => Number(category.limit) || 0));
  const budget = Number(state.budget) || 0;
  const over = budget > 0 && total > budget;
  note.textContent = budget
    ? `Your limits add up to ${money(total)} of your ${money(budget)} monthly budget.${over ? " That is over your budget." : ""}`
    : total > 0
      ? `Your limits add up to ${money(total)}. Set a monthly budget in Settings to compare.`
      : "";
  note.classList.toggle("is-over", over);
}

function render(): void {
  $("#category-rows").innerHTML = state.categories.map(rowHtml).join("");
  $("#category-add").innerHTML = addFormHtml();
  updateLimitsNote();
  refreshIcons();
}

function rowOf(element: Element | null): HTMLElement | null {
  return element?.closest<HTMLElement>(".cat-row") ?? null;
}

function categoryOf(row: HTMLElement | null) {
  return state.categories.find((category) => category.id === row?.dataset.category);
}

let messageTimer: ReturnType<typeof setTimeout> | undefined;
function say(row: HTMLElement, text: string, isError = false): void {
  const message = row.querySelector<HTMLElement>(".cat-message");
  if (!message) return;
  message.textContent = text;
  message.classList.toggle("is-error", isError);
  clearTimeout(messageTimer);
  if (!isError) messageTimer = setTimeout(() => (message.textContent = ""), 2200);
}

async function commitName(row: HTMLElement, input: HTMLInputElement): Promise<void> {
  const category = categoryOf(row);
  if (!category) return;
  const typed = input.value.replace(/\s+/g, " ").trim();
  if (typed === category.name) {
    input.value = category.name;
    return;
  }
  // A built-in category left blank keeps its name, as it always has.
  const name = typed || (!category.custom ? category.name : "");
  const problem = nameProblem(name, category.id);
  if (problem) {
    say(row, problem, true);
    input.value = category.name;
    return;
  }
  try {
    if (category.custom) await renameCategory(category.id, name);
    category.name = name;
    input.value = name;
    saveState();
    options?.onChange();
    say(row, "Saved");
  } catch (error) {
    input.value = category.name;
    say(row, error instanceof Error ? error.message : "Could not rename that. Please try again.", true);
  }
}

function commitLimit(row: HTMLElement, input: HTMLInputElement): void {
  const category = categoryOf(row);
  if (!category) return;
  const parsed = parseLimit(input.value);
  const saved = Number(category.limit) > 0 ? toInputValue(category.limit) : "";
  if (!parsed.ok) {
    say(row, parsed.message, true);
    input.value = saved;
    return;
  }
  const usd = parsed.value > 0 ? displayToUsd(parsed.value) : 0;
  input.value = usd > 0 ? toInputValue(usd) : "";
  if (input.value === saved) return;
  category.limit = usd;
  saveState();
  updateLimitsNote();
  options?.onChange();
  say(row, usd > 0 ? "Saved" : "Limit removed");
}

async function addCategory(form: HTMLFormElement): Promise<void> {
  const input = form.querySelector<HTMLInputElement>("#cat-new-name");
  const error = form.querySelector<HTMLElement>(".cat-add-error");
  if (!input || !error) return;
  const name = input.value.replace(/\s+/g, " ").trim();
  const problem = nameProblem(name);
  error.textContent = problem ?? "";
  if (problem) {
    input.focus();
    return;
  }
  const color = form.querySelector<HTMLInputElement>('input[name="cat-color"]:checked')?.value;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const { category } = await createCategory(name, color);
    const custom = state.categories
      .filter((entry) => entry.custom)
      .map((entry) => ({ key: entry.id, name: entry.name, color: entry.color }));
    syncCustomCategories([...custom, category]);
    saveState();
    options?.onChange();
    render();
    $<HTMLInputElement>("#cat-new-name").focus();
    showToast(`Added ${category.name}.`);
  } catch (failure) {
    error.textContent = failure instanceof Error ? failure.message : "Could not add that category. Please try again.";
    if (button) button.disabled = false;
  }
}

async function deleteCustom(id: string): Promise<void> {
  const category = state.categories.find((entry) => entry.id === id);
  if (!category?.custom) return;
  try {
    await deleteCategory(id);
    const remaining = state.categories
      .filter((entry) => entry.custom && entry.id !== id)
      .map((entry) => ({ key: entry.id, name: entry.name, color: entry.color }));
    syncCustomCategories(remaining);
    confirmDeleteId = null;
    saveState();
    await loadLinkedTransactions(options?.month()); // its spending moves to Other
    options?.onChange();
    render();
    showToast(`Deleted ${category.name}. Its transactions moved to Other.`);
  } catch (failure) {
    confirmDeleteId = null;
    render();
    const row = $("#category-rows").querySelector<HTMLElement>(`[data-category="${id}"]`);
    if (row) say(row, failure instanceof Error ? failure.message : "Could not delete that. Please try again.", true);
  }
}

/** Opens the panel, scrolls to it, and puts the cursor in the limit box of `focusId` (or the first name). */
export function openCategoriesPanel(focusId?: string): void {
  const element = panel();
  element.hidden = false;
  $("#edit-summary").setAttribute("aria-expanded", "true");
  confirmDeleteId = null;
  render();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  const row = focusId ? $("#category-rows").querySelector<HTMLElement>(`[data-category="${focusId}"]`) : null;
  const target = row?.querySelector<HTMLInputElement>(".cat-limit-input") ?? element.querySelector<HTMLInputElement>(".cat-name");
  target?.focus({ preventScroll: true });
  row?.classList.add("is-focus");
}

function closePanel(): void {
  panel().hidden = true;
  const button = $("#edit-summary");
  button.setAttribute("aria-expanded", "false");
  button.focus();
}

export function initCategoriesPanel(settings: Options): void {
  options = settings;
  const element = panel();

  $("#edit-summary").addEventListener("click", () => (element.hidden ? openCategoriesPanel() : closePanel()));
  $("#categories-done").addEventListener("click", closePanel);

  element.addEventListener("change", (event) => {
    const target = event.target;
    const row = rowOf(target instanceof Element ? target : null);
    if (!row || !(target instanceof HTMLInputElement)) return;
    if (target.classList.contains("cat-visible")) {
      const category = categoryOf(row);
      if (!category) return;
      category.visible = target.checked;
      saveState();
      options?.onChange();
      say(row, target.checked ? "Shown on the chart" : "Hidden from the chart");
    } else if (target.classList.contains("cat-name")) {
      void commitName(row, target);
    } else if (target.classList.contains("cat-limit-input")) {
      commitLimit(row, target);
    }
  });

  element.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !(target.classList.contains("cat-name") || target.classList.contains("cat-limit-input"))) return;
    if (event.key === "Enter") {
      event.preventDefault();
      target.blur(); // leaving the box saves it
    } else if (event.key === "Escape") {
      const category = categoryOf(rowOf(target));
      if (category) target.value = target.classList.contains("cat-name") ? category.name : Number(category.limit) > 0 ? toInputValue(category.limit) : "";
      target.blur();
    }
  });

  element.addEventListener("click", (event) => {
    const target = eventElement(event);
    const del = target?.closest<HTMLElement>("[data-delete-category]");
    if (del?.dataset.deleteCategory) {
      confirmDeleteId = del.dataset.deleteCategory;
      render();
      $("#category-rows").querySelector<HTMLElement>(".is-confirming .cat-danger")?.focus();
      return;
    }
    const confirm = target?.closest<HTMLElement>("[data-confirm-delete]");
    if (confirm?.dataset.confirmDelete) {
      void deleteCustom(confirm.dataset.confirmDelete);
      return;
    }
    if (target?.closest("[data-cancel-delete]")) {
      confirmDeleteId = null;
      render();
    }
  });

  element.addEventListener("submit", (event) => {
    if (event.target instanceof HTMLFormElement && event.target.id === "category-add-form") {
      event.preventDefault();
      void addCategory(event.target);
    }
  });
}
