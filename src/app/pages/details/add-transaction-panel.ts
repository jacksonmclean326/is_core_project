import { $, displayToUsd, escapeHTML, reloadViewedMonth, shownCurrency, showToast, state, viewingMonth } from "../../core.js";
import { createManualTransaction } from "../../api.js";
import { currencySymbol } from "../../../shared/currencies.js";
import { addDays, addMonths, currentMonthKey, localDateString, monthEnd, monthName, transactionHistoryMonths } from "../../../shared/months.js";

/**
 * "Add a transaction" on Details: a panel that opens above the transaction list, styled like the
 * Categories and Goals panels, instead of a pop-up dialog. It stays open after adding so several
 * purchases can be entered in a row; the date and category are kept for the next one.
 */

const panel = () => $("#add-tx-panel");
const button = () => $("#add-transaction");

function defaultDate(): string {
  return viewingMonth === currentMonthKey() ? localDateString() : monthEnd(viewingMonth);
}

function categoryOptions(selected: string): string {
  return state.categories
    .map((item) => `<option value="${escapeHTML(item.id)}"${item.id === selected ? " selected" : ""}>${escapeHTML(item.name)}</option>`)
    .join("");
}

function render(presetCategory?: string): void {
  const category = presetCategory ?? state.categories.find((item) => item.visible)?.id ?? "other";
  const minDate = `${addMonths(currentMonthKey(), -transactionHistoryMonths)}-01`;
  const maxDate = addDays(localDateString(), 1);
  $("#add-tx-form-slot").innerHTML = `<form class="tx-add" id="tx-add-form" novalidate>
    <div class="tx-add-fields">
      <label class="tx-add-field tx-add-name"><span>Merchant or description</span><input id="txa-name" maxlength="60" autocomplete="off" autocapitalize="words" enterkeyhint="next" placeholder="Coffee shop"></label>
      <label class="tx-add-field tx-add-amount"><span>Amount</span><span class="cat-limit"><span class="cat-symbol" aria-hidden="true">${escapeHTML(currencySymbol(shownCurrency()))}</span><input id="txa-amount" class="cat-limit-input" inputmode="decimal" enterkeyhint="next" autocomplete="off" placeholder="0.00"></span></label>
      <label class="tx-add-field tx-add-date"><span>Date</span><input id="txa-date" type="date" min="${minDate}" max="${maxDate}" value="${defaultDate()}"></label>
      <label class="tx-add-field tx-add-category"><span>Category</span><select id="txa-category">${categoryOptions(category)}</select></label>
      <button class="primary-button" type="submit">Add</button>
    </div>
    <p class="cat-add-error" id="txa-error" role="alert"></p>
    <p class="tx-add-done" id="txa-done" role="status" aria-live="polite"></p>
  </form>`;
}

async function submit(form: HTMLFormElement): Promise<void> {
  const error = $("#txa-error", form);
  const done = $("#txa-done", form);
  const nameBox = $<HTMLInputElement>("#txa-name", form);
  const amountBox = $<HTMLInputElement>("#txa-amount", form);
  const dateBox = $<HTMLInputElement>("#txa-date", form);
  const fail = (text: string, box: HTMLElement) => {
    error.textContent = text;
    done.textContent = "";
    box.focus();
  };
  const name = nameBox.value.replace(/\s+/g, " ").trim();
  if (!name) return fail("Enter a merchant or description.", nameBox);
  const typed = Number(amountBox.value.replace(/[,\s]/g, "").replace(/^\p{Sc}+|\p{Sc}+$/gu, ""));
  if (!amountBox.value.trim() || !Number.isFinite(typed) || typed <= 0) return fail("Enter an amount greater than 0.", amountBox);
  if (!dateBox.value) return fail("Choose a date.", dateBox);
  if (dateBox.value < dateBox.min || dateBox.value > dateBox.max) return fail("Choose a date within the last year, up to today.", dateBox);

  const input = { name, amount: displayToUsd(typed), date: dateBox.value, category: $<HTMLSelectElement>("#txa-category", form).value };
  const add = $<HTMLButtonElement>('button[type="submit"]', form);
  add.disabled = true;
  error.textContent = "";
  done.textContent = "Saving…";
  try {
    const { transaction } = await createManualTransaction(input);
    await reloadViewedMonth();
    const month = transaction.date.slice(0, 7);
    const where = month === viewingMonth ? "" : ` in ${monthName(month)}`;
    // Ready for the next one: keep the date and category, clear the rest.
    nameBox.value = "";
    amountBox.value = "";
    // The exact amount as typed (the page's money format drops cents, which would turn $4.50 into $5).
    const exact = new Intl.NumberFormat(undefined, { style: "currency", currency: shownCurrency() }).format(typed);
    done.textContent = `Added ${name}, ${exact}${where}.`;
    showToast(`Transaction added${where}.`);
    nameBox.focus();
  } catch (failure) {
    done.textContent = "";
    error.textContent = failure instanceof Error ? failure.message : "Could not save that transaction.";
  } finally {
    add.disabled = false;
  }
}

/** Opens the panel with the cursor in the merchant box. */
export function openAddTransaction(presetCategory?: string): void {
  const element = panel();
  if (element.hidden || presetCategory) render(presetCategory);
  element.hidden = false;
  button().setAttribute("aria-expanded", "true");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  $<HTMLInputElement>("#txa-name").focus({ preventScroll: true });
}

function close(): void {
  panel().hidden = true;
  button().setAttribute("aria-expanded", "false");
  button().focus();
}

export function initAddTransaction(): void {
  button().addEventListener("click", () => (panel().hidden ? openAddTransaction() : close()));
  $("#add-tx-done").addEventListener("click", close);
  panel().addEventListener("submit", (event) => {
    if (event.target instanceof HTMLFormElement && event.target.id === "tx-add-form") {
      event.preventDefault();
      void submit(event.target);
    }
  });
  panel().addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}
