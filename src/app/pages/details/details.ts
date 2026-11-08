import { loadGoals, saveGoalSteps } from "../../goals.js";
import {
  $,
  $$,
  escapeHTML,
  eventElement,
  getMonthTransactions,
  loadLinkedTransactions,
  loadSavedBudget,
  movesWholeMerchant,
  onDataChanged,
  prefetchMonth,
  primeFromSnapshot,
  money,
  openCategoryDetails,
  refreshIcons,
  showToast,
  state,
  totalSpent,
  usingRealData,
} from "../../core.js";
import { initCategoriesPanel, openCategoriesPanel } from "./categories-panel.js";
import { initGoalsPanel } from "./goals-panel.js";
import { initAddTransaction, openAddTransaction } from "./add-transaction-panel.js";
import {
  filterTransactions,
  renderRows,
  sortLabels,
  sortTransactions,
  summarizeList,
  type ListSort,
} from "../../../shared/transaction-list.js";
import {
  addMonths,
  compareMonths,
  currentMonthKey,
  isMonthKey,
  monthLabel,
  monthName,
  monthRange,
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
/** "empty" means the account has no bank and no transactions yet, so we show a prompt instead of numbers. */
let dataMode: "loading" | "empty" | "data" = "loading";
let goalsStatus: "loading" | "ready" | "error" = "loading";

function renderPeriod() {
  const thisMonth = currentMonthKey();
  $("#period-label").textContent = monthLabel(selectedMonth).toUpperCase();
  // With no data there is no history to browse, so the picker and buttons are hidden and only the label shows.
  const select = $<HTMLSelectElement>("#month-select");
  if (!select.options.length) {
    select.innerHTML = monthRange(thisMonth, transactionHistoryMonths + 1)
      .reverse()
      .map((month) => `<option value="${month}">${monthLabel(month)}${month === thisMonth ? " (this month)" : ""}</option>`)
      .join("");
  }
  select.value = selectedMonth;
  select.hidden = !isLinked;
  $("#period-label").hidden = isLinked;
  $<HTMLButtonElement>("#month-current").hidden = !isLinked || selectedMonth === thisMonth;
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
    dataMode = "data";
    renderSummary();
  }
  renderPeriod();
  const result = await loadLinkedTransactions(month);
  if (result === "stale") return;
  isLinked = result === "linked";
  if (result === "linked" || result === "sample") dataMode = result === "linked" ? "data" : "empty";
  if (result === "error") showToast(`Could not load ${monthLabel(month)}.`);
  renderPeriod();
  renderSummary();
  // Get the neighbouring months ready so the arrows feel instant.
  if (isLinked) {
    prefetchMonth(addMonths(month, -1));
    if (compareMonths(month, currentMonthKey()) < 0) prefetchMonth(addMonths(month, 1));
  }
}

const listView = { query: "", category: "", sort: "newest" as ListSort, shown: 100, open: null as string | null };
const pageSize = 100;

function categoryLabel(key: string): string {
  return state.categories.find((category) => category.id === key)?.name ?? "Other";
}

/** The flat list of every transaction in the viewed month, with search, filter, sort and inline editing. */
function renderTransactionList() {
  const all = getMonthTransactions();
  const real = usingRealData();
  const controls = $("#tx-controls");
  const monthText = monthName(selectedMonth);

  // category filter: rebuilt from the current categories, keeping the user's choice if it still exists
  const filter = $<HTMLSelectElement>("#tx-category-filter");
  const keep = state.categories.some((category) => category.id === listView.category) ? listView.category : "";
  listView.category = keep;
  filter.innerHTML =
    `<option value="">All categories</option>` +
    state.categories.map((category) => `<option value="${escapeHTML(category.id)}">${escapeHTML(category.name)}</option>`).join("");
  filter.value = keep;
  const sort = $<HTMLSelectElement>("#tx-sort");
  if (!sort.options.length) {
    sort.innerHTML = (Object.keys(sortLabels) as ListSort[])
      .map((key) => `<option value="${key}">${sortLabels[key]}</option>`)
      .join("");
  }
  sort.value = listView.sort;

  const summary = $("#tx-summary");
  const list = $("#tx-list");
  const more = $<HTMLButtonElement>("#tx-more");
  more.hidden = true;

  if (!real) {
    controls.hidden = true;
    summary.textContent = "";
    list.innerHTML = `<p class="tx-empty">Link a bank on Accounts, or choose Add transaction above, and every transaction will be listed here.</p>`;
    return;
  }
  controls.hidden = false;

  if (!all.length) {
    controls.hidden = true;
    summary.textContent = "";
    list.innerHTML = `<p class="tx-empty">No transactions in ${escapeHTML(monthText)}.</p>`;
    return;
  }

  const shownRows = sortTransactions(
    filterTransactions(all, { query: listView.query, category: listView.category }, categoryLabel),
    listView.sort,
  );
  const totals = summarizeList(shownRows);
  const filtered = shownRows.length !== all.length;
  summary.textContent = filtered
    ? `${totals.count} of ${all.length} transactions \u00b7 ${money(totals.total)}`
    : `${totals.count} transaction${totals.count === 1 ? "" : "s"} \u00b7 ${money(totals.total)}`;

  if (!shownRows.length) {
    list.innerHTML = `<p class="tx-empty">Nothing matches that search.</p>`;
    return;
  }

  const page = shownRows.slice(0, listView.shown);
  list.innerHTML = renderRows(page, listView.sort, {
    categories: state.categories.map((category) => ({ id: category.id, name: category.name, color: category.color })),
    money,
    escape: escapeHTML,
    openId: listView.open,
    movesWholeMerchant: movesWholeMerchant(),
  });
  if (shownRows.length > page.length) {
    more.hidden = false;
    more.textContent = `Show ${Math.min(pageSize, shownRows.length - page.length)} more (${shownRows.length - page.length} left)`;
  }
}

function periodWord(): string {
  return selectedMonth === currentMonthKey() ? "THIS MONTH" : monthName(selectedMonth).toUpperCase();
}

function renderSummary() {
  renderTransactionList();
  const empty = dataMode === "empty";
  $("#empty-state").hidden = !empty;
  $("#empty-state").style.display = empty ? "" : "none";
  document.querySelector<HTMLElement>(".spending-layout")?.style.setProperty("display", empty ? "none" : "");
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
        return `<div class="top-category-row"><button class="top-category-name" type="button" data-category-id="${category.id}"><span class="legend-swatch" style="background:${category.color}"></span>${escapeHTML(category.name)}</button><span class="top-category-values">${money(category.amount)} <strong>${percent}%</strong><button class="row-edit" type="button" data-edit-category="${category.id}" aria-label="Edit ${escapeHTML(category.name)}" title="Rename or set a limit for ${escapeHTML(category.name)}"><i data-icon="pencil" aria-hidden="true"></i></button></span><div class="top-category-track"><span style="width:${percent}%;background:${category.color}"></span></div></div>`;
      })
      .join("") ||
    `<p class="watch-empty">Choose a category in Edit categories to show it here.</p>`;
  $("#goal-card-list").innerHTML = goalsStatus !== "ready"
    ? `<p class="watch-empty">${goalsStatus === "loading" ? "Loading your goals…" : "Unable to load goals. Check your connection and Supabase goals setup, then refresh to try again."}</p>`
    : state.goals.length
    ? state.goals.map(goalCardHTML).join("")
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

/** Darkens a pale category color (like the tan "Other") so its ring still shows against the track. */
function ringColor(hex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const channels = [0, 2, 4].map((start) => {
    const value = parseInt((match[1] as string).slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * (channels[0] as number) + 0.7152 * (channels[1] as number) + 0.0722 * (channels[2] as number);
  if (luminance <= 0.42) return hex;
  return `color-mix(in srgb, ${hex} 70%, #17201d)`;
}

/**
 * A goal card with a progress ring. The ring takes its category's color (spending goals) or its goal
 * type's color (see details.css). Near or over a limit shows in the colored status line.
 */
function goalCardHTML(goal: (typeof state.goals)[number]): string {
  const ratio = goal.target > 0 ? goal.progress / goal.target : 0;
  const isSpending = goal.kind === "Spending";
  const isChecklist = goal.kind === "Checklist";
  const over = isSpending && ratio > 1;
  const near = isSpending && ratio >= 0.9 && ratio <= 1;
  const done = !isSpending && ratio >= 1;
  const left = Math.max(0, goal.target - goal.progress);
  const tone = over ? "is-over" : near ? "is-near" : done ? "is-done" : "";
  const shown = Math.round(ratio * 100);
  const percent = !isSpending && done ? "100%" : shown > 999 ? "999%+" : `${shown}%`;
  const status = isChecklist
    ? done
      ? "All steps done"
      : `${left} ${left === 1 ? "step" : "steps"} left`
    : over
    ? `${money(goal.progress - goal.target)} over your limit`
    : near
      ? `${money(left)} left · near your limit`
      : done
        ? "Goal reached"
        : isSpending
          ? `${money(left)} left`
          : `${money(left)} to go`;
  const category = goal.category
    ? ` · ${escapeHTML(state.categories.find((item) => item.id === goal.category)?.name ?? "Category")}`
    : "";
  const note = goal.note && !done ? `<p class="goal-note">${escapeHTML(goal.note)}</p>` : "";
  const stepsList =
    isChecklist && goal.steps?.length
      ? `<ul class="goal-steps" aria-label="Steps for ${escapeHTML(goal.name)}">${goal.steps
          .map(
            (step, index) =>
              `<li><label><input type="checkbox" data-goal-step data-goal-id="${escapeHTML(goal.id)}" data-step-index="${index}"${step.done ? " checked" : ""}><span>${escapeHTML(step.text)}</span></label></li>`,
          )
          .join("")}</ul>`
      : "";
  const label = `${goal.name}:${percent}${isSpending ? " of limit used" : " of goal"}`;
  const arc = Math.min(100, Math.max(0, ratio * 100));
  const value =
    arc > 0
      ? `<circle class="goal-ring-value" cx="50" cy="50" r="40" pathLength="100" stroke-dasharray="${arc} 100" />`
      : "";
  const categoryColor = goal.category ? state.categories.find((item) => item.id === goal.category)?.color : undefined;
  const colorStyle = categoryColor ? ` style="--goal-color:${ringColor(categoryColor)}"` : "";
  return `<article class="goal-card goal-ring-card ${tone}" data-goal-id="${escapeHTML(goal.id)}" data-kind="${escapeHTML(goal.kind)}"${colorStyle}><div class="goal-card-top"><span class="goal-kind">${escapeHTML(goal.kind)} goal${category}${goal.automatic ? " · automatic" : ""}</span><i data-icon="target" aria-hidden="true"></i></div><div class="goal-ring-body"><div class="goal-ring" role="img" aria-label="${escapeHTML(label)}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="goal-ring-track" cx="50" cy="50" r="40" />${value}</svg><span class="goal-ring-percent">${percent}</span></div><div class="goal-ring-text"><strong>${escapeHTML(goal.name)}</strong><span class="goal-ring-amount">${isChecklist ? `${goal.progress} of ${goal.target} steps` : `${money(goal.progress)} of ${money(goal.target)}${isSpending ? " limit" : ""}`}</span><span class="goal-ring-status">${status}</span></div></div>${stepsList}${note}</article>`;
}

initCategoriesPanel({ onChange: renderSummary, month: () => selectedMonth });
initGoalsPanel({ onChange: renderSummary });
// Ticking a step of a checklist goal saves right away and redraws just that card.
$("#goal-card-list").addEventListener("change", async (event) => {
  const box = (event.target as Element | null)?.closest<HTMLInputElement>("[data-goal-step]");
  const goalId = box?.dataset.goalId;
  const index = Number(box?.dataset.stepIndex);
  const goal = state.goals.find((item) => item.id === goalId);
  if (!box || !goal?.steps || !Number.isInteger(index) || !goal.steps[index]) return;
  const previous = goal.steps.map((step) => ({ ...step }));
  const next = previous.map((step, position) => (position === index ? { ...step, done: box.checked } : step));
  const replaceCard = (updated: (typeof state.goals)[number]) => {
    state.goals = state.goals.map((item) => (item.id === updated.id ? updated : item));
    const card = $$<HTMLElement>("#goal-card-list .goal-card").find((item) => item.dataset.goalId === updated.id);
    if (!card) return;
    card.outerHTML = goalCardHTML(updated);
    refreshIcons();
    $$<HTMLInputElement>("#goal-card-list [data-goal-step]")
      .find((item) => item.dataset.goalId === updated.id && Number(item.dataset.stepIndex) === index)
      ?.focus();
  };
  // Show the change straight away, then save it; put it back if saving fails.
  replaceCard({ ...goal, steps: next, progress: next.filter((step) => step.done).length });
  try {
    replaceCard(await saveGoalSteps(goal.id, next));
  } catch (error) {
    replaceCard({ ...goal, steps: previous, progress: previous.filter((step) => step.done).length });
    showToast(error instanceof Error ? error.message : "Could not save that step. Try again.");
  }
});
$("#top-category-list").addEventListener("click", (event) => {
  const edit = eventElement(event)?.closest<HTMLElement>("[data-edit-category]");
  if (edit?.dataset.editCategory) openCategoriesPanel(edit.dataset.editCategory);
});
// "See every transaction" scrolls within the page. As a plain link it reloaded Details and dropped the month.
document.querySelector<HTMLAnchorElement>(".view-all-link")?.addEventListener("click", (event) => {
  event.preventDefault();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("#all-transactions").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
});
initAddTransaction();
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

$("#month-select").addEventListener("change", (event) => {
  const month = (event.target as HTMLSelectElement).value;
  if (isMonthKey(month)) void showMonth(month);
});
$("#month-current").addEventListener("click", () => void showMonth(currentMonthKey()));
$("#month-prev").addEventListener("click", () => void showMonth(addMonths(selectedMonth, -1)));
$("#month-next").addEventListener("click", () => void showMonth(addMonths(selectedMonth, 1)));

// Draw this tab's last known numbers immediately (if any), then refresh them.
if (primeFromSnapshot(selectedMonth) === "linked") {
  isLinked = true;
  dataMode = "data";
}
renderPeriod();
renderSummary();
void showMonth(selectedMonth);
const goalsContainer = $("#goal-card-list");
const editGoalsButton = $<HTMLButtonElement>("#edit-goals-link");
editGoalsButton.disabled = true;
renderSummary();
goalsContainer.textContent = "Loading your goals…";
void loadGoals().then((goals) => {
  if (!goalsContainer.isConnected) return;
  state.goals = goals;
  goalsStatus = "ready";
  renderSummary();
  editGoalsButton.disabled = false;
}).catch(() => {
  if (!goalsContainer.isConnected) return;
  goalsStatus = "error";
  goalsContainer.textContent = "Unable to load goals. Check your connection and Supabase goals setup, then refresh to try again.";
});

void loadSavedBudget().then((changed) => {
  if (changed) renderSummary();
});
$("#empty-add").addEventListener("click", () => openAddTransaction());
// Home links here with ?add=1 to start adding a transaction straight away.
if (new URLSearchParams(window.location.search).get("add") === "1") {
  const cleaned = new URL(window.location.href);
  cleaned.searchParams.delete("add");
  window.history.replaceState(null, "", cleaned);
  openAddTransaction();
}

refreshIcons();
onDataChanged((result) => {
  isLinked = result === "linked";
  if (result === "linked" || result === "sample") dataMode = result === "linked" ? "data" : "empty";
  renderPeriod();
  renderSummary();
});

$("#tx-search").addEventListener("input", (event) => {
  listView.query = (event.target as HTMLInputElement).value;
  listView.shown = pageSize;
  renderTransactionList();
});
$("#tx-category-filter").addEventListener("change", (event) => {
  listView.category = (event.target as HTMLSelectElement).value;
  listView.shown = pageSize;
  renderTransactionList();
});
$("#tx-sort").addEventListener("change", (event) => {
  listView.sort = (event.target as HTMLSelectElement).value as ListSort;
  listView.shown = pageSize;
  renderTransactionList();
});
// Tapping a transaction opens it (category buttons and actions); tapping it again closes it.
$("#tx-list").addEventListener("click", (event) => {
  const toggle = eventElement(event)?.closest<HTMLElement>("[data-tx-toggle]");
  if (!toggle) return;
  const id = toggle.dataset.txToggle ?? null;
  listView.open = listView.open === id ? null : id;
  renderTransactionList();
  $$<HTMLElement>("#tx-list [data-tx-toggle]").find((button) => button.dataset.txToggle === id)?.focus();
});
$("#tx-more").addEventListener("click", () => {
  listView.shown += pageSize;
  renderTransactionList();
});

