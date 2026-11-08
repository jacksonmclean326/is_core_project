import {
  createManualTransaction,
  deleteManualTransaction,
  recategorizeTransaction,
  updateManualTransaction
} from "../api.js";
import {
  addDays,
  addMonths,
  currentMonthKey,
  localDateString,
  monthEnd,
  monthName,
  shortDateLabel,
  transactionHistoryMonths
} from "../../shared/months.js";
import { limitStatus, parseLimit } from "../../shared/limits.js";
import { getManualTransaction, movesWholeMerchant, redrawDataPage, reloadViewedMonth, setMovesWholeMerchant, usingRealData, viewingMonth } from "../transactions/transactions.js";
import { displayToUsd, money, saveState, state, toInputValue, transactions } from "../state/state.js";
import { $, closeDialog, escapeHTML, openDialog, showToast } from "./ui.js";

let editingLimit: string | undefined;
let editingManualId: string | undefined;
let openCategoryId: string | undefined;

export function openCategoryDetails(categoryId: string | undefined): void {
  if (!categoryId) return;
  const category = state.categories.find((item) => item.id === categoryId);
  if (!category) return;
  const rows = transactions[categoryId] ?? [["Recent purchase", money(category.amount)]];
  openCategoryId = categoryId;
  const options = state.categories
    .map((item) => `<option value="${escapeHTML(item.id)}"${item.id === categoryId ? " selected" : ""}>${escapeHTML(item.name)}</option>`)
    .join("");
  const canMove = rows.some((row) => row[3] && !getManualTransaction(row[3]));
  const detailRows = rows.map(([name, amount, detail, id]) => {
    const manual = id ? getManualTransaction(id) : undefined;
    return `<div class="transaction-row"><span>${escapeHTML(name)}<small>${escapeHTML(detail || "Linked account")}</small></span>${id && !manual ? `<select class="recategorize-select" data-transaction-id="${escapeHTML(id)}" data-merchant="${escapeHTML(name)}" aria-label="Move ${escapeHTML(name)} to another category">${options}</select>` : ""}<span class="row-amount">${escapeHTML(amount)}</span>${id && manual ? `<span class="row-actions"><button type="button" class="row-action" data-edit-manual="${escapeHTML(id)}" aria-label="Edit ${escapeHTML(name)}">Edit</button><button type="button" class="row-action" data-delete-manual="${escapeHTML(id)}" aria-label="Delete ${escapeHTML(name)}">Delete</button></span>` : ""}</div>`;
  }).join("");
  const applyRow = canMove
    ? `<label class="apply-merchant"><input type="checkbox" id="apply-merchant"${movesWholeMerchant() ? " checked" : ""}> Move all transactions from the same merchant, including future ones</label>`
    : "";
  const chartTotal = state.categories.filter((item) => item.visible).reduce((total, item) => total + Number(item.amount || 0), 0);
  const share = chartTotal ? category.amount / chartTotal * 100 : 0;
  const limit = Number(category.limit) || 0;
  const used = limit ? Math.min(100, category.amount / limit * 100) : 0;
  const standing = limitStatus(category.amount, limit);
  const isClose = standing === "close" || standing === "reached";
  const status = { none: "No category limit set", within: "Within category budget", close: "Close to category limit", reached: "Category limit reached" }[standing];
  const average = rows.length ? category.amount / rows.length : category.amount;
  const limitEditor = editingLimit === categoryId
    ? `<form class="limit-form" data-limit-form="${escapeHTML(category.id)}"><label for="limit-input">Monthly limit for ${escapeHTML(category.name)}</label><div class="limit-form-row"><input id="limit-input" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="No limit" aria-describedby="limit-hint limit-feedback" value="${limit ? toInputValue(limit) : ""}"><button class="primary-button" type="submit">Save</button><button class="text-button" type="button" data-cancel-limit>Cancel</button></div><p class="dialog-form-feedback" id="limit-hint">Leave it blank to remove the limit.</p><p class="dialog-form-feedback" id="limit-feedback" role="alert"></p></form>`
    : `<button type="button" class="text-button limit-edit" data-edit-limit="${escapeHTML(category.id)}">${limit ? "Change limit" : "Set a limit"}</button>`;

  openDialog(
    `<p class="eyebrow">${monthName(viewingMonth).toUpperCase()} SPENDING</p><h2 class="dialog-title">${escapeHTML(category.name)}</h2><p class="dialog-subtitle">Category spending details</p><section class="category-detail-summary" aria-label="${escapeHTML(category.name)} spending summary"><p>Spent in ${monthName(viewingMonth)}</p><strong class="category-detail-amount">${money(category.amount)}</strong><span class="category-detail-limit">${limit ? `of ${money(limit)} monthly limit` : "No monthly limit"}</span>${limitEditor}<div class="category-detail-track"><span style="width:${used}%;background:${category.color}"></span></div><div class="category-detail-status${isClose ? " is-close" : ""}"><i data-icon="${isClose ? "triangle-alert" : "circle-check"}" aria-hidden="true"></i><span>${status}</span></div><div class="category-detail-stats"><div><span>Share</span><strong>${share.toFixed(1)}%</strong></div><div><span>Purchases</span><strong>${rows.length}</strong></div><div><span>Average</span><strong>${money(average)}</strong></div></div></section><section class="category-detail-transactions"><h3>Transactions</h3>${applyRow}${detailRows || `<p class="watch-empty">No transactions in ${monthName(viewingMonth)}.</p>`}</section>`
  );
}

function defaultEntryDate(): string {
  const today = localDateString();
  return viewingMonth === currentMonthKey() ? today : monthEnd(viewingMonth);
}

export function openTransactionForm(existingId?: string, presetCategory?: string): void {
  const existing = existingId ? getManualTransaction(existingId) : undefined;
  editingManualId = existing?.id;
  const category = existing?.category ?? presetCategory ?? state.categories.find((item) => item.visible)?.id ?? "other";
  const options = state.categories
    .map((item) => `<option value="${escapeHTML(item.id)}"${item.id === category ? " selected" : ""}>${escapeHTML(item.name)}</option>`)
    .join("");
  const minDate = `${addMonths(currentMonthKey(), -transactionHistoryMonths)}-01`;
  const maxDate = addDays(localDateString(), 1);
  const note = usingRealData()
    ? "Record spending your bank did not import. Manual entries count toward your totals."
    : "Add your first transaction to start tracking your spending.";

  openDialog(
    `<p class="eyebrow">${existing ? "EDIT" : "ADD"} TRANSACTION</p><h2 class="dialog-title">${existing ? "Edit transaction" : "Add a transaction"}</h2><p class="dialog-subtitle">${note}</p><form id="transaction-form" class="edit-form"><label class="field"><span>Merchant or description</span><input id="tx-name" maxlength="60" required autocomplete="off" autocapitalize="words" enterkeyhint="next" value="${escapeHTML(existing?.name ?? "")}"></label><label class="field"><span>Amount</span><input id="tx-amount" type="number" min="0.01" max="1000000" step="0.01" inputmode="decimal" enterkeyhint="next" required value="${existing ? toInputValue(existing.amount) : ""}"></label><label class="field"><span>Date</span><input id="tx-date" type="date" required min="${minDate}" max="${maxDate}" value="${existing?.date ?? defaultEntryDate()}"></label><label class="field"><span>Category</span><select id="tx-category">${options}</select></label><p class="dialog-form-feedback" id="tx-feedback" role="alert"></p><button class="primary-button" type="submit">${existing ? "Save changes" : "Add transaction"}</button></form>`
  );
  $<HTMLInputElement>("#tx-name").focus();
}

export function setCategoryLimit(categoryId: string, limit: number): void {
  const category = state.categories.find((item) => item.id === categoryId);
  if (!category) return;
  category.limit = limit;
  saveState();
  redrawDataPage();
}

// Editor forms opt in with data-guard-unsaved. Closing one with edits that were not saved asks first.
const guardedForm = "form[data-guard-unsaved]";

function markDirty(target: EventTarget | null): void {
  if (target instanceof Element) target.closest(guardedForm)?.setAttribute("data-dirty", "1");
}

function hasUnsavedChanges(dialog: HTMLDialogElement): boolean {
  return Boolean(dialog.querySelector(`${guardedForm}[data-dirty="1"]`));
}

function showUnsavedPrompt(dialog: HTMLDialogElement): void {
  if (dialog.querySelector(".unsaved-bar")) return;
  const bar = document.createElement("div");
  bar.className = "unsaved-bar";
  bar.setAttribute("role", "alert");
  bar.innerHTML =
    `<p><strong>Save your changes?</strong> You have edits that have not been saved yet.</p>` +
    `<div class="unsaved-actions"><button type="button" class="primary-button" data-unsaved="save">Save</button>` +
    `<button type="button" class="outline-button" data-unsaved="discard">Discard</button>` +
    `<button type="button" class="text-button" data-unsaved="keep">Keep editing</button></div>`;
  $("#dialog-content").prepend(bar);
  dialog.scrollTop = 0;
  bar.querySelector<HTMLButtonElement>('[data-unsaved="save"]')?.focus();
}

document.addEventListener("input", (event) => markDirty(event.target));
document.addEventListener("change", (event) => markDirty(event.target));
document.querySelector<HTMLDialogElement>("#detail-dialog")?.addEventListener("cancel", (event) => {
  const dialog = event.currentTarget as HTMLDialogElement;
  if (!hasUnsavedChanges(dialog)) return;
  event.preventDefault();
  showUnsavedPrompt(dialog);
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const dialog = document.querySelector<HTMLDialogElement>("#detail-dialog");

  // Adding or removing a row inside an editor form is an edit too.
  if (target?.closest(`${guardedForm} button[type="button"]`)) markDirty(target);

  const unsaved = target?.closest<HTMLElement>("[data-unsaved]");
  if (dialog && unsaved) {
    const form = dialog.querySelector<HTMLFormElement>(guardedForm);
    dialog.querySelector(".unsaved-bar")?.remove();
    if (unsaved.dataset.unsaved === "save") form?.requestSubmit();
    else if (unsaved.dataset.unsaved === "discard") closeDialog();
    return;
  }

  if (dialog && (target === dialog || target?.closest(".dialog-close"))) {
    if (hasUnsavedChanges(dialog)) {
      showUnsavedPrompt(dialog);
      return;
    }
    editingLimit = undefined;
    closeDialog();
    return;
  }

  const editLimit = target?.closest<HTMLElement>("[data-edit-limit]");
  if (editLimit?.dataset.editLimit) {
    editingLimit = editLimit.dataset.editLimit;
    openCategoryDetails(editingLimit);
    $<HTMLInputElement>("#limit-input").focus();
    return;
  }
  if (target?.closest("[data-cancel-limit]") && editingLimit) {
    const categoryId = editingLimit;
    editingLimit = undefined;
    openCategoryDetails(categoryId);
    return;
  }

  // A category button on an opened transaction in the list.
  const moveButton = target?.closest<HTMLButtonElement>("[data-move-tx]");
  if (moveButton?.dataset.moveTx && moveButton.dataset.moveCategory) {
    if (moveButton.getAttribute("aria-pressed") === "true") return;
    const group = [...(moveButton.parentElement?.querySelectorAll<HTMLButtonElement>("[data-move-tx]") ?? [])];
    group.forEach((button) => (button.disabled = true));
    moveTransactionTo(moveButton.dataset.moveTx, moveButton.dataset.merchant ?? "this transaction", moveButton.dataset.moveCategory, () =>
      group.forEach((button) => (button.disabled = false)),
    );
    return;
  }

  const editManual = target?.closest<HTMLElement>("[data-edit-manual]");
  if (editManual?.dataset.editManual) {
    openTransactionForm(editManual.dataset.editManual);
    return;
  }
  const deleteManual = target?.closest<HTMLElement>("[data-delete-manual]");
  const transactionId = deleteManual?.dataset.deleteManual;
  if (!transactionId) return;
  const entry = getManualTransaction(transactionId);
  if (!window.confirm(`Delete "${entry?.name ?? "this transaction"}"?`)) return;
  const reopenCategory = openCategoryId;
  void deleteManualTransaction(transactionId)
    .then(async () => {
      await reloadViewedMonth();
      if (reopenCategory && dialog?.open) openCategoryDetails(reopenCategory);
      showToast("Transaction deleted.");
    })
    .catch((error: unknown) => showToast(error instanceof Error ? error.message : "Could not delete that transaction."));
});

/**
 * Moves one transaction to another category (and, for a bank transaction with the merchant option on, every
 * transaction from the same merchant), then redraws. `onFail` puts the control back the way it was.
 */
function moveTransactionTo(transactionId: string, merchant: string, categoryId: string, onFail: () => void): void {
  const destination = state.categories.find((category) => category.id === categoryId);
  const manual = getManualTransaction(transactionId);
  const move = manual
    ? updateManualTransaction(transactionId, { category: categoryId }).then(() => ({ moved: 1 }))
    : recategorizeTransaction({ transactionId, category: categoryId, applyToMerchant: movesWholeMerchant() });
  void move
    .then(async (result) => {
      await reloadViewedMonth();
      const dialog = document.querySelector<HTMLDialogElement>("#detail-dialog");
      if (dialog?.open && openCategoryId) openCategoryDetails(openCategoryId);
      showToast(
        result.moved > 1
          ? `Moved ${result.moved} ${merchant} transactions to ${destination?.name ?? "that category"}.`
          : `Moved ${merchant} to ${destination?.name ?? "that category"}.`
      );
    })
    .catch((error: unknown) => {
      onFail();
      showToast(error instanceof Error ? error.message : "Could not move that transaction.");
    });
}

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && (target.id === "apply-merchant" || target.classList.contains("apply-merchant-toggle"))) {
    setMovesWholeMerchant(target.checked);
    document.querySelectorAll<HTMLInputElement>("#apply-merchant, .apply-merchant-toggle").forEach((box) => {
      box.checked = target.checked;
    });
    return;
  }
  if (!(target instanceof HTMLSelectElement) || !target.classList.contains("recategorize-select")) return;
  const transactionId = target.dataset.transactionId;
  if (!transactionId) return;
  const previous = [...target.options].find((option) => option.defaultSelected)?.value ?? "";
  target.disabled = true;
  moveTransactionTo(transactionId, target.dataset.merchant ?? "this transaction", target.value, () => {
    target.value = previous;
    target.disabled = false;
  });
});

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (form instanceof HTMLFormElement && form.id === "transaction-form") {
    event.preventDefault();
    const feedback = $("#tx-feedback", form);
    const submit = $<HTMLButtonElement>('button[type="submit"]', form);
    const input = {
      name: $<HTMLInputElement>("#tx-name", form).value.trim(),
      // Typed in the chosen currency, saved in dollars.
      amount: displayToUsd(Number($<HTMLInputElement>("#tx-amount", form).value)),
      date: $<HTMLInputElement>("#tx-date", form).value,
      category: $<HTMLSelectElement>("#tx-category", form).value
    };
    if (!input.name) {
      feedback.textContent = "Enter a merchant or description.";
      return;
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      feedback.textContent = "Enter an amount greater than 0.";
      return;
    }
    if (!input.date) {
      feedback.textContent = "Choose a date.";
      return;
    }
    submit.disabled = true;
    feedback.textContent = "Saving...";
    const editing = editingManualId;
    const save = editing ? updateManualTransaction(editing, input) : createManualTransaction(input);
    void save
      .then(async ({ transaction }) => {
        await reloadViewedMonth();
        closeDialog();
        const savedMonth = transaction.date.slice(0, 7);
        showToast(
          savedMonth === viewingMonth
            ? editing ? "Transaction updated." : "Transaction added."
            : `${editing ? "Transaction updated" : "Transaction added"} in ${monthName(savedMonth)}.`
        );
      })
      .catch((error: unknown) => {
        feedback.textContent = error instanceof Error ? error.message : "Could not save that transaction.";
        submit.disabled = false;
      });
    return;
  }

  const limitForm = form instanceof HTMLFormElement ? form.closest<HTMLFormElement>("[data-limit-form]") : null;
  if (!limitForm?.dataset.limitForm) return;
  event.preventDefault();
  const categoryId = limitForm.dataset.limitForm;
  const result = parseLimit($<HTMLInputElement>("#limit-input", limitForm).value);
  if (!result.ok) {
    const feedback = $("#limit-feedback", limitForm);
    feedback.textContent = result.message;
    feedback.classList.add("is-error");
    return;
  }
  // Typed in the chosen currency, kept in dollars.
  setCategoryLimit(categoryId, displayToUsd(result.value));
  editingLimit = undefined;
  openCategoryDetails(categoryId);
  showToast(result.value ? "Limit updated." : "Limit removed.");
});
