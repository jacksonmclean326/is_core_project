import {
  $,
  escapeHTML,
  eventElement,
  loadLinkedTransactions,
  loadSavedBudget,
  onDataChanged,
  primeFromSnapshot,
  months,
  money,
  openCategoryDetails,
  refreshIcons,
  showToast,
  state,
  totalSpent,
  trendValues,
  trends,
} from "../../core.js";
import {
  currentMonthKey,
  fullDateEyebrow,
  localDateString,
  monthName,
} from "../../../shared/months.js";
import { getBankConnections } from "../../api.js";
import "../../page-navigation.js";

function selectedTrendMode(): keyof typeof trends {
  const mode = $<HTMLSelectElement>("#trend-mode").value;
  return mode === "under" || mode === "saved" ? mode : "spending";
}

function renderTrend(mode: keyof typeof trends = selectedTrendMode()) {
  const trend = trends[mode];
  const values = trendValues(mode);
  const budget = Number(state.budget) || 0;
  const current = values.at(-1) ?? 0;
  const previous = values.at(-2) ?? 0;
  const difference = current - previous;
  const relative = previous
    ? Math.round(Math.abs(difference / previous) * 100)
    : 0;
  const trendIcon =
    mode === "spending"
      ? difference <= 0
        ? "arrow-down-right"
        : "arrow-up-right"
      : difference >= 0
        ? "arrow-up-right"
        : "arrow-down-right";
  $("#trend-value").textContent = trend.format(current);
  $("#trend-caption").textContent =
    mode !== "spending" && !budget
      ? "set a budget to see this trend"
      : trend.caption;
  $("#trend-change").innerHTML =
    `<i data-icon="${trendIcon}" aria-hidden="true"></i> ${mode === "under" ? `${Math.abs(difference)} pts` : `${relative}%`} from last month`;

  const width = 850;
  const height = 220;
  const left = 33;
  const right = 828;
  const top = 20;
  const bottom = 176;
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  const min = highest === lowest ? lowest - 1 : lowest * 0.82;
  const max = highest === lowest ? highest + 1 : highest * 1.08;
  const points = values.map((value, index) => ({
    x: left + ((right - left) * index) / (values.length - 1),
    y: bottom - ((value - min) / (max - min)) * (bottom - top),
  }));
  const currentPoint = points.at(-1);
  if (!currentPoint) return;
  const linePath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    )
    .join(" ");
  const areaPath = `${linePath} L${right} ${bottom} L${left} ${bottom} Z`;
  const grid = [0, 1, 2, 3]
    .map((step) => {
      const y = top + ((bottom - top) * step) / 3;
      return `<line class="chart-grid" x1="${left}" y1="${y}" x2="${right}" y2="${y}" />`;
    })
    .join("");
  const dots = points
    .map(
      (point, index) =>
        `<circle class="chart-dot${index === points.length - 1 ? " current" : ""}" cx="${point.x}" cy="${point.y}" r="${index === points.length - 1 ? 5 : 4}" />`,
    )
    .join("");
  const labels = points
    .map(
      (point, index) =>
        `<text class="chart-label" x="${point.x}" y="205" text-anchor="middle">${months[index]}</text>`,
    )
    .join("");
  const label =
    mode === "under"
      ? "Percent under budget"
      : mode === "saved"
        ? "Amount saved"
        : "Monthly spending";
  const firstMonth = months[0] ?? "";
  const lastMonth = months.at(-1) ?? "";
  $("#trend-chart").setAttribute("aria-label", `${label}, ${firstMonth} through ${lastMonth}`);
  $("#trend-chart").innerHTML =
    `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#8eaa96" stop-opacity=".32"/><stop offset="100%" stop-color="#8eaa96" stop-opacity=".015"/></linearGradient></defs>${grid}<path class="chart-area" d="${areaPath}"/><path class="chart-line" d="${linePath}"/><line class="chart-guide" x1="${currentPoint.x}" y1="${top}" x2="${currentPoint.x}" y2="${bottom}"/>${dots}${labels}</svg>`;
  refreshIcons();
}

function renderPeriodLabels() {
  const thisMonth = currentMonthKey();
  $("#today-label").textContent = fullDateEyebrow(localDateString());
  $("#period-label").textContent = `${monthName(thisMonth).toUpperCase()} OVERVIEW`;
}

/** "empty" means no bank and no transactions yet: show a prompt instead of a chart of zeros. */
let dataMode: "loading" | "empty" | "data" = "loading";

function renderDashboard() {
  renderPeriodLabels();
  const empty = dataMode === "empty";
  $("#empty-state").hidden = !empty;
  $("#empty-state").style.display = empty ? "" : "none";
  document.querySelector<HTMLElement>(".trend-section")?.style.setProperty("display", empty ? "none" : "");
  const spent = totalSpent();
  const budget = Number(state.budget) || 0;
  const remaining = budget - spent;
  $("#streak-count").textContent = String(state.streak || 0);
  $(".streak-indicator").setAttribute(
    "aria-label",
    `${state.streak || 0} day streak`,
  );
  $("#budget-total").textContent = budget ? money(budget) : "NO BUDGET";
  $("#spent-total").textContent = money(spent);
  $("#remaining-total").textContent = budget
    ? `${remaining < 0 ? "-" : ""}${money(remaining)}`
    : "NO BUDGET";
  const used = budget ? Math.min(100, (spent / budget) * 100) : 0;
  $("#budget-progress").style.width = `${used}%`;
  $(".budget-track").setAttribute(
    "aria-label",
    budget
      ? `${Math.round(used)} percent of monthly budget used`
      : "No monthly budget set",
  );

  const watched = state.categories
    .filter(
      (category) => category.limit && category.amount / category.limit >= 0.75,
    )
    .sort(
      (first, second) =>
        second.amount / second.limit - first.amount / first.limit,
    );
  $("#watch-categories").innerHTML = watched.length
    ? watched
        .map(
          (category) =>
            `<div class="watch-item"><button type="button" data-category-id="${category.id}">${escapeHTML(category.name)}</button><span class="watch-amount">${Math.round((category.amount / category.limit) * 100)}%</span></div>`,
        )
        .join("")
    : `<span class="watch-empty">Nothing near its limit right now.</span>`;
  renderTrend();
}

async function loadBankAccountCount() {
  const status = $("#sync-account-status");
  try {
    const result = await getBankConnections();
    const accounts = result.connections.flatMap((connection) =>
      connection.accounts.map((account) => ({
        id: account.id,
        institution: connection.institution,
        detail: account.mask
          ? `•••• ${account.mask} · ${account.subtype || account.type}`
          : account.subtype || account.type,
        balance:
          account.balance === null && account.availableBalance === null
            ? 0
            : account.type === "credit" &&
                (account.balance ?? account.availableBalance ?? 0) > 0
              ? -(account.balance ?? account.availableBalance ?? 0)
              : account.balance ?? account.availableBalance ?? 0,
      })),
    );
    state.accounts = accounts;
    status.textContent = `${accounts.length} linked ${accounts.length === 1 ? "account" : "accounts"}`;
  } catch (error) {
    console.error("Unable to load the linked bank account count.", error);
    state.accounts = [];
    status.textContent = "Bank account data unavailable. Try the Accounts tab.";
  }
}

$("#trend-mode").addEventListener("change", () => renderTrend(selectedTrendMode()));
$("#watch-categories").addEventListener("click", (event) => {
  const categoryButton = eventElement(event)?.closest<HTMLButtonElement>("[data-category-id]");
  if (categoryButton) openCategoryDetails(categoryButton.dataset.categoryId);
});
primeFromSnapshot(currentMonthKey(), months.length - 1);
renderDashboard();
void loadLinkedTransactions(currentMonthKey(), months.length - 1).then((result) => {
  if (result === "linked" || result === "sample") dataMode = result === "linked" ? "data" : "empty";
  if (result === "linked" || result === "sample") {
    renderDashboard();
    renderTrend();
  } else if (result === "error") {
    showToast("Could not load this month's bank transactions.");
  }
});
void loadBankAccountCount();
void loadSavedBudget().then((changed) => {
  if (changed) renderDashboard();
});
refreshIcons();
onDataChanged((result) => {
  if (result === "linked" || result === "sample") dataMode = result === "linked" ? "data" : "empty";
  renderDashboard();
  renderTrend();
});
