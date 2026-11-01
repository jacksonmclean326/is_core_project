import {
  $,
  $$,
  escapeHTML,
  eventElement,
  loadLinkedTransactions,
  onDataChanged,
  prefetchMonth,
  primeFromSnapshot,
  openTransactionForm,
  money,
  openCategoryDetails,
  refreshIcons,
  saveState,
  showToast,
  state,
  syncCustomCategories,
  totalSpent,
} from "../../core.js";
import { createCategory, deleteCategory, renameCategory } from "../../api.js";
import {
  addMonths,
  compareMonths,
  currentMonthKey,
  isMonthKey,
  monthLabel,
  monthName,
  transactionHistoryMonths,
  type MonthKey,
} from "../../../shared/months.js";
import "../../page-navigation.js";

function initialMonth(): MonthKey {
  const thisMonth = currentMonthKey();
  const requested = new URLSearchParams(window.location.search).get("month");
  if (!isMonthKey(requested)) return thisMonth;
  if (compareMonths(requested, thisMonth) > 0) return thisMonth;
  if (compareMonths(requested, addMonths(thisMonth, -transactionHistoryMonths)) < 0) return thisMonth;
  return requested;
}

let selectedMonth: MonthKey = initialMonth();
let isLinked = false;

function renderPeriod() {
  const thisMonth = currentMonthKey();
  $("#period-label").textContent = monthLabel(selectedMonth).toUpperCase();
  // Sample data has no history to browse, so only the buttons are hidden.
  $<HTMLButtonElement>("#month-prev").hidden = !isLinked;
  $<HTMLButtonElement>("#month-next").hidden = !isLinked;
  $<HTMLButtonElement>("#month-prev").disabled =
    compareMonths(selectedMonth, addMonths(thisMonth, -transactionHistoryMonths)) <= 0;
  $<HTMLButtonElement>("#month-next").disabled = compareMonths(selectedMonth, thisMonth) >= 0;
}

async function showMonth(month: MonthKey) {
  selectedMonth = month;
  const url = new URL(window.location.href);
  if (month === currentMonthKey()) url.searchParams.delete("month");
  else url.searchParams.set("month", month);
  window.history.replaceState(null, "", url);
  // Show what this tab already knows about the month straight away, then refresh it.
  if (primeFromSnapshot(month) === "linked") {
    isLinked = true;
    renderSummary();
  }
  renderPeriod();
  const result = await loadLinkedTransactions(month);
  if (result === "stale") return;
  isLinked = result === "linked";
  if (result === "error") showToast(`Could not load ${monthLabel(month)}.`);
  renderPeriod();
  renderSummary();
  // Get the neighbouring months ready so the arrows feel instant.
  if (isLinked) {
    prefetchMonth(addMonths(month, -1));
    if (compareMonths(month, currentMonthKey()) < 0) prefetchMonth(addMonths(month, 1));
  }
}

function periodWord(): string {
  return selectedMonth === currentMonthKey() ? "THIS MONTH" : monthName(selectedMonth).toUpperCase();
}

function renderSummary() {
  $("#summary-spent-label").textContent =
    selectedMonth === currentMonthKey() ? "Current monthly spending" : `${monthName(selectedMonth)} spending`;
  const spent = totalSpent();
  const visible = state.categories.filter((category) => category.visible);
  const chartSpent = visible.reduce(
    (total, category) => total + Number(category.amount || 0),
    0,
  );
  const budget = Number(state.budget) || 0;
  $("#summary-spent").textContent = money(spent);
  $("#summary-budget").textContent = budget ? money(budget) : "NO BUDGET";
  $("#summary-available").textContent = budget
    ? money(Math.max(0, budget - spent))
    : "Set a budget";
  $("#donut-center-label").textContent = periodWord();
  $("#donut-total").textContent = money(chartSpent);
  $("#donut-center-subtitle").textContent = "across categories";
  $("#donut-chart").classList.remove("is-previewing");
  delete $("#donut-chart").dataset.previewCategory;
  const circumference = 2 * Math.PI * 87;
  let dashOffset = 0;
  $("#donut-slices").innerHTML = visible
    .map((category) => {
      const length = chartSpent
        ? (Number(category.amount) / chartSpent) * circumference
        : 0;
      const circle = `<circle class="donut-slice" data-category-id="${category.id}" cx="110" cy="110" r="87" fill="none" stroke="${category.color}" stroke-width="46" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-dashOffset}" transform="rotate(-90 110 110)" />`;
      dashOffset += length;
      return circle;
    })
    .join("");
  $("#donut-chart").style.background = "transparent";
  $("#donut-chart").setAttribute(
    "aria-label",
    `Interactive chart. Focus and use arrow keys to preview a category; press Enter for details. Monthly spending of ${money(chartSpent)}. ${visible.map((category) => `${category.name}, ${money(category.amount)}`).join(". ")}`,
  );
  $("#category-legend").innerHTML = visible
    .map(
      (category) =>
        `<button class="legend-row" type="button" data-category-id="${category.id}"><span class="legend-swatch" style="background:${category.color}"></span><span>${escapeHTML(category.name)}</span></button>`,
    )
    .join("");
  $("#top-category-list").innerHTML =
    [...visible]
      .sort((first, second) => second.amount - first.amount)
      .slice(0, 3)
      .map((category) => {
        const percent = chartSpent
          ? Math.round((category.amount / chartSpent) * 100)
          : 0;
        return `<div class="top-category-row"><button class="top-category-name" type="button" data-category-id="${category.id}"><span class="legend-swatch" style="background:${category.color}"></span>${escapeHTML(category.name)}</button><span class="top-category-values">${money(category.amount)} <strong>${percent}%</strong></span><div class="top-category-track"><span style="width:${percent}%;background:${category.color}"></span></div></div>`;
      })
      .join("") ||
    `<p class="watch-empty">Choose a category in Edit to show it here.</p>`;
  $("#goal-card-list").innerHTML = state.goals.length
    ? state.goals
        .map((goal) => {
          const progress = goal.target
            ? Math.min(100, (goal.progress / goal.target) * 100)
            : 0;
          return `<article class="goal-card"><div class="goal-card-top"><span class="goal-kind">${escapeHTML(goal.kind)} goal</span><i data-lucide="target" aria-hidden="true"></i></div><strong>${escapeHTML(goal.name)}</strong><div class="mini-track"><span style="width:${progress}%"></span></div><div class="goal-amounts"><span>${money(goal.progress)} toward goal</span><span>${money(goal.target)} goal</span></div></article>`;
        })
        .join("")
    : `<p class="watch-empty">Add a goal to see your progress here.</p>`;
  refreshIcons();
}

function previewDonutCategory(category: (typeof state.categories)[number] | undefined) {
  if (!category) return resetDonutPreview();
  const visibleTotal = state.categories
    .filter((item) => item.visible)
    .reduce((total, item) => total + Number(item.amount || 0), 0);
  const share = visibleTotal
    ? Math.round((category.amount / visibleTotal) * 100)
    : 0;
  const chart = $("#donut-chart");
  chart.classList.add("is-previewing");
  chart.dataset.previewCategory = category.id;
  $$(".donut-slice", chart).forEach((slice) => {
    const active = slice.dataset.categoryId === category.id;
    slice.classList.toggle("is-active", active);
    slice.classList.toggle("is-muted", !active);
  });
  $$(".legend-row, .top-category-name").forEach((row) => {
    const active = row.dataset.categoryId === category.id;
    row.classList.toggle("is-active", active);
    row.classList.toggle("is-muted", !active);
  });
  chart.setAttribute(
    "aria-label",
    `${category.name}: ${money(category.amount)}, ${share}% of visible summary spending. Press Enter for details.`,
  );
  $("#donut-center-label").textContent = category.name;
  $("#donut-total").textContent = money(category.amount);
  $("#donut-center-subtitle").textContent = `${share}% of spending`;
}

function resetDonutPreview() {
  const chart = $("#donut-chart");
  const visible = state.categories.filter((category) => category.visible);
  const total = visible.reduce(
    (sum, category) => sum + Number(category.amount || 0),
    0,
  );
  chart.classList.remove("is-previewing");
  delete chart.dataset.previewCategory;
  $$(
    ".donut-slice.is-active, .donut-slice.is-muted, .legend-row.is-active, .legend-row.is-muted, .top-category-name.is-active, .top-category-name.is-muted",
  ).forEach((element) => element.classList.remove("is-active", "is-muted"));
  chart.setAttribute(
    "aria-label",
    `Interactive chart. Focus and use arrow keys to preview a category; press Enter for details. Monthly spending of ${money(total)}. ${visible.map((category) => `${category.name}, ${money(category.amount)}`).join(". ")}`,
  );
  $("#donut-center-label").textContent = periodWord();
  $("#donut-total").textContent = money(total);
  $("#donut-center-subtitle").textContent = "across categories";
}

function categoryAtDonutPoint(event: PointerEvent) {
  const chart = $("#donut-chart");
  const rect = chart.getBoundingClientRect();
  const radius = Math.min(rect.width, rect.height) / 2;
  const deltaX = event.clientX - (rect.left + rect.width / 2);
  const deltaY = event.clientY - (rect.top + rect.height / 2);
  if (Math.hypot(deltaX, deltaY) < radius * 0.64) return null;
  const angle = ((Math.atan2(deltaY, deltaX) * 180) / Math.PI + 90 + 360) % 360;
  const visible = state.categories.filter(
    (category) => category.visible && Number(category.amount) > 0,
  );
  const total = visible.reduce(
    (sum, category) => sum + Number(category.amount),
    0,
  );
  const position = (angle / 360) * total;
  let accumulated = 0;
  return (
    visible.find((category) => {
      accumulated += Number(category.amount);
      return position < accumulated;
    }) ||
    visible.at(-1) ||
    null
  );
}

function openSummaryEditor() {
  const categoryRows = state.categories
    .map(
      (category) =>
        `<div class="edit-row category-edit-row${category.custom ? " has-remove" : ""}" data-category-row="${category.id}"><input class="category-visible" type="checkbox" data-category-id="${category.id}" aria-label="Show ${escapeHTML(category.name)} in summary" ${category.visible ? "checked" : ""}><input class="category-name" data-category-id="${category.id}" aria-label="Category name" maxlength="24" value="${escapeHTML(category.name)}">${category.custom ? `<button type="button" class="remove-goal" data-remove-category aria-label="Delete ${escapeHTML(category.name)}"><i data-lucide="x" aria-hidden="true"></i></button>` : ""}</div>`,
    )
    .join("");
  const goalRows = state.goals
    .map(
      (goal) =>
        `<div class="edit-row goal-edit-row" data-goal-row="${escapeHTML(goal.id)}"><select class="goal-kind-input" aria-label="Goal type"><option ${goal.kind === "Savings" ? "selected" : ""}>Savings</option><option ${goal.kind === "Spending" ? "selected" : ""}>Spending</option><option ${goal.kind === "Earnings" ? "selected" : ""}>Earnings</option><option ${goal.kind === "Investing" ? "selected" : ""}>Investing</option></select><input class="goal-name-input" aria-label="Goal name" maxlength="36" value="${escapeHTML(goal.name)}"><input class="goal-target-input" aria-label="Goal amount" type="number" min="1" step="1" value="${Number(goal.target)}"><button type="button" class="remove-goal" data-remove-goal="${escapeHTML(goal.id)}" aria-label="Remove ${escapeHTML(goal.name)}"><i data-lucide="x" aria-hidden="true"></i></button></div>`,
    )
    .join("");
  $("#dialog-content").innerHTML =
    `<p class="eyebrow">MAKE IT YOURS</p><h2 class="dialog-title">Edit your summary</h2><p class="dialog-subtitle">Choose which categories appear and keep your goals up to date.</p><form id="summary-edit-form" class="edit-form"><h3>SUMMARY CATEGORIES</h3>${categoryRows}<button class="add-goal-button" type="button" id="add-category-row"><i data-lucide="plus" aria-hidden="true"></i> Add a category</button><h3>GOALS</h3><div id="goal-editor-rows">${goalRows}</div><button class="add-goal-button" type="button" id="add-goal-row"><i data-lucide="plus" aria-hidden="true"></i> Add a goal</button><p class="dialog-form-feedback" id="edit-feedback" aria-live="polite"></p><button class="primary-button" type="submit">Save changes</button></form>`;
  $<HTMLDialogElement>("#detail-dialog").showModal();
  refreshIcons();
}

const maxCustomCategories = 12;
const maxCategoryName = 24;

function addCategoryEditorRow() {
  const form = $("#summary-edit-form");
  if ($$(".category-edit-row.has-remove", form).length >= maxCustomCategories) {
    $("#edit-feedback").textContent = `You can add up to ${maxCustomCategories} custom categories.`;
    return;
  }
  $("#add-category-row").insertAdjacentHTML(
    "beforebegin",
    `<div class="edit-row category-edit-row has-remove" data-new-category="1"><input class="category-visible" type="checkbox" checked aria-label="Show new category in summary"><input class="category-name" aria-label="Category name" maxlength="${maxCategoryName}" placeholder="Name your category"><button type="button" class="remove-goal" data-remove-category aria-label="Remove new category"><i data-lucide="x" aria-hidden="true"></i></button></div>`,
  );
  $$<HTMLInputElement>('[data-new-category="1"] .category-name', form).at(-1)?.focus();
  refreshIcons();
}

function addGoalEditorRow() {
  const id = `goal-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  $("#goal-editor-rows").insertAdjacentHTML(
    "beforeend",
    `<div class="edit-row goal-edit-row" data-goal-row="${id}"><select class="goal-kind-input" aria-label="Goal type"><option>Savings</option><option>Spending</option><option>Earnings</option><option>Investing</option></select><input class="goal-name-input" aria-label="Goal name" maxlength="36" placeholder="Give your goal a name"><input class="goal-target-input" aria-label="Goal amount" type="number" min="1" step="1" placeholder="400"><button type="button" class="remove-goal" data-remove-goal="${id}" aria-label="Remove new goal"><i data-lucide="x" aria-hidden="true"></i></button></div>`,
  );
  refreshIcons();
}

async function saveSummaryEditor(event: SubmitEvent) {
  event.preventDefault();
  const feedback = $("#edit-feedback");
  const form = event.currentTarget as HTMLFormElement;
  const goalRows = $$(".goal-edit-row", form);
  const goals = [];
  for (const row of goalRows) {
    const name = $<HTMLInputElement>(".goal-name-input", row).value.trim();
    const target = Number($<HTMLInputElement>(".goal-target-input", row).value);
    const kind = $<HTMLSelectElement>(".goal-kind-input", row).value;
    if (!name || !target || target > state.income) {
      feedback.textContent =
        target > state.income
          ? "Set each goal below your monthly income."
          : "Add a name and amount to every goal, or remove the empty row.";
      return;
    }
    const oldGoal = state.goals.find((goal) => goal.id === row.dataset.goalRow);
    const id = oldGoal?.id ?? row.dataset.goalRow;
    if (!id) throw new Error("Goal editor row is missing its identifier.");
    goals.push({
      id,
      kind,
      name,
      target,
      progress: oldGoal?.progress || 0,
    });
  }

  const entries = $$(".category-edit-row", form).map((row) => {
    const id = row.dataset.categoryRow;
    const existing = state.categories.find((category) => category.id === id);
    const typed = $<HTMLInputElement>(".category-name", row).value.replace(/\s+/g, " ").trim();
    return {
      id,
      isNew: row.dataset.newCategory === "1",
      existing,
      // an emptied built-in name keeps its old name, as before
      name: typed || (existing && !existing.custom ? existing.name : ""),
      visible: $<HTMLInputElement>(".category-visible", row).checked,
    };
  });
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.name) {
      feedback.textContent = "Give every new category a name, or remove the empty row.";
      return;
    }
    if (entry.name.length > maxCategoryName || /[<>]/.test(entry.name)) {
      feedback.textContent = `Category names can be up to ${maxCategoryName} characters and cannot contain < or >.`;
      return;
    }
    if (seen.has(entry.name.toLowerCase())) {
      feedback.textContent = `You already have a category called "${entry.name}".`;
      return;
    }
    seen.add(entry.name.toLowerCase());
  }

  const submit = $<HTMLButtonElement>('button[type="submit"]', form);
  submit.disabled = true;
  feedback.textContent = "Saving...";
  try {
    const keptIds = new Set(entries.map((entry) => entry.id));
    for (const removed of state.categories.filter((category) => category.custom && !keptIds.has(category.id))) {
      await deleteCategory(removed.id);
    }
    const customList: { key: string; name: string; color: string }[] = [];
    const createdVisibility = new Map<string, boolean>();
    for (const entry of entries) {
      if (entry.isNew) {
        const { category } = await createCategory(entry.name);
        customList.push(category);
        createdVisibility.set(category.key, entry.visible);
      } else if (entry.existing?.custom) {
        if (entry.name !== entry.existing.name) await renameCategory(entry.existing.id, entry.name);
        customList.push({ key: entry.existing.id, name: entry.name, color: entry.existing.color });
      }
    }
    syncCustomCategories(customList);
    for (const entry of entries.filter((item) => !item.isNew && item.existing)) {
      const category = state.categories.find((item) => item.id === entry.id);
      if (!category) continue;
      if (!category.custom) category.name = entry.name;
      category.visible = entry.visible;
    }
    for (const [key, visible] of createdVisibility) {
      const created = state.categories.find((category) => category.id === key);
      if (created) created.visible = visible;
    }
    state.goals = goals;
    saveState();
    await loadLinkedTransactions(selectedMonth); // deleted categories move their spending to Other
    $<HTMLDialogElement>("#detail-dialog").close();
    renderSummary();
    showToast("Your summary and goals are updated.");
  } catch (error) {
    feedback.textContent = error instanceof Error ? error.message : "Could not save your changes.";
    submit.disabled = false;
    void loadLinkedTransactions(selectedMonth).then(renderSummary);
  }
}

$("#edit-summary").addEventListener("click", openSummaryEditor);
$("#add-transaction").addEventListener("click", () => openTransactionForm());
$("#edit-goals-link").addEventListener("click", openSummaryEditor);
$("#detail-dialog").addEventListener("submit", (event) => {
  if (event.target instanceof Element && event.target.id === "summary-edit-form") void saveSummaryEditor(event);
});
$("#detail-dialog").addEventListener("click", (event) => {
  const target = eventElement(event);
  if (!target) return;
  if (target.closest("#add-goal-row")) addGoalEditorRow();
  if (target.closest("#add-category-row")) addCategoryEditorRow();
  const removeCategory = target.closest("[data-remove-category]");
  if (removeCategory) {
    const row = removeCategory.closest<HTMLElement>(".category-edit-row");
    const name = row ? $<HTMLInputElement>(".category-name", row).value : "";
    const isSaved = Boolean(row?.dataset.categoryRow);
    if (!isSaved || window.confirm(`Delete "${name}"? Its transactions move to Other.`)) row?.remove();
  }
  const removeGoal = target.closest("[data-remove-goal]");
  removeGoal?.closest(".goal-edit-row")?.remove();
});
$(".app-shell").addEventListener("click", (event) => {
  const categoryButton = eventElement(event)?.closest<HTMLButtonElement>(
    ".legend-row, .top-category-name",
  );
  if (categoryButton) openCategoryDetails(categoryButton.dataset.categoryId);
});

const donutChart = $("#donut-chart");
donutChart.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  const category = categoryAtDonutPoint(event);
  if (category) previewDonutCategory(category);
  else resetDonutPreview();
});
donutChart.addEventListener("pointerleave", resetDonutPreview);
donutChart.addEventListener("click", (event) => {
  const category = categoryAtDonutPoint(event);
  if (category) openCategoryDetails(category.id);
});
donutChart.addEventListener("keydown", (event) => {
  if (
    ![
      "ArrowRight",
      "ArrowDown",
      "ArrowLeft",
      "ArrowUp",
      "Enter",
      "Escape",
    ].includes(event.key)
  )
    return;
  event.preventDefault();
  const categories = state.categories.filter((category) => category.visible);
  if (event.key === "Escape") return resetDonutPreview();
  if (event.key === "Enter") {
    const selected = categories.find(
      (category) => category.id === donutChart.dataset.previewCategory,
    );
    if (selected) openCategoryDetails(selected.id);
    return;
  }
  if (!categories.length) return;
  const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
  const selectedIndex = categories.findIndex(
    (category) => category.id === donutChart.dataset.previewCategory,
  );
  const nextIndex =
    (selectedIndex + direction + categories.length) % categories.length;
  previewDonutCategory(categories[nextIndex]);
});
$(".app-shell").addEventListener("pointerover", (event) => {
  const row = eventElement(event)?.closest<HTMLElement>(".legend-row, .top-category-name");
  if (row)
    previewDonutCategory(
      state.categories.find(
        (category) => category.id === row.dataset.categoryId,
      ),
    );
});
$(".app-shell").addEventListener("pointerout", (event) => {
  const row = eventElement(event)?.closest<HTMLElement>(".legend-row, .top-category-name");
  if (row && !(event.relatedTarget instanceof Node && row.contains(event.relatedTarget))) resetDonutPreview();
});
$(".app-shell").addEventListener("focusin", (event) => {
  const row = eventElement(event)?.closest<HTMLElement>(".legend-row, .top-category-name");
  if (row)
    previewDonutCategory(
      state.categories.find(
        (category) => category.id === row.dataset.categoryId,
      ),
    );
});
$(".app-shell").addEventListener("focusout", (event) => {
  const row = eventElement(event)?.closest<HTMLElement>(".legend-row, .top-category-name");
  if (row && !(event.relatedTarget instanceof Node && row.contains(event.relatedTarget))) resetDonutPreview();
});

$("#month-prev").addEventListener("click", () => void showMonth(addMonths(selectedMonth, -1)));
$("#month-next").addEventListener("click", () => void showMonth(addMonths(selectedMonth, 1)));

// Draw this tab's last known numbers immediately (if any), then refresh them.
if (primeFromSnapshot(selectedMonth) === "linked") isLinked = true;
renderPeriod();
renderSummary();
void showMonth(selectedMonth);
refreshIcons();
onDataChanged((result) => {
  isLinked = result === "linked";
  renderPeriod();
  renderSummary();
});
