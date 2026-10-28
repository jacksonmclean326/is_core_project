import {
  $,
  escapeHTML,
  eventElement,
  months,
  money,
  openCategoryDetails,
  refreshIcons,
  state,
  totalSpent,
  trends,
} from "../../core.js";

function selectedTrendMode(): keyof typeof trends {
  const mode = $<HTMLSelectElement>("#trend-mode").value;
  return mode === "under" || mode === "saved" ? mode : "spending";
}

function renderTrend(mode: keyof typeof trends = selectedTrendMode()) {
  const trend = trends[mode];
  const values = [...trend.values];
  const budget = Number(state.budget) || 0;
  const spent = totalSpent();
  if (mode === "spending") values[values.length - 1] = spent;
  if (mode === "under")
    values[values.length - 1] = budget
      ? Math.max(0, Math.round(((budget - spent) / budget) * 100))
      : 0;
  if (mode === "saved")
    values[values.length - 1] = budget ? Math.max(0, budget - spent) : 0;
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
    `<i data-lucide="${trendIcon}" aria-hidden="true"></i> ${mode === "under" ? `${Math.abs(difference)} pts` : `${relative}%`} from last month`;

  const width = 850;
  const height = 220;
  const left = 33;
  const right = 828;
  const top = 20;
  const bottom = 176;
  const min = Math.min(...values) * 0.82;
  const max = Math.max(...values) * 1.08;
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
  $("#trend-chart").setAttribute("aria-label", `${label}, May through October`);
  $("#trend-chart").innerHTML =
    `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#8eaa96" stop-opacity=".32"/><stop offset="100%" stop-color="#8eaa96" stop-opacity=".015"/></linearGradient></defs>${grid}<path class="chart-area" d="${areaPath}"/><path class="chart-line" d="${linePath}"/><line class="chart-guide" x1="${currentPoint.x}" y1="${top}" x2="${currentPoint.x}" y2="${bottom}"/>${dots}${labels}</svg>`;
  refreshIcons();
}

function renderDashboard() {
  const spent = totalSpent();
  const budget = Number(state.budget) || 0;
  const remaining = budget - spent;
  $("#streak-count").textContent = String(state.streak || 0);
  $(".streak-indicator").setAttribute(
    "aria-label",
    `${state.streak || 0} day streak`,
  );
  $("#sync-account-count").textContent = String(state.accounts.length);
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
  const goal =
    state.goals.find((item) => item.kind === "Savings") || state.goals[0];
  if (goal) {
    $("#dashboard-goal-name").textContent = goal.name;
    $("#dashboard-goal-progress").innerHTML =
      `${money(goal.progress)} <span>of ${money(goal.target)}</span>`;
    $("#dashboard-goal-track").style.width =
      `${Math.min(100, (goal.progress / goal.target) * 100)}%`;
  } else {
    $("#dashboard-goal-name").textContent = "Add a goal to get started";
    $("#dashboard-goal-progress").textContent = "No goal set";
    $("#dashboard-goal-track").style.width = "0%";
  }
  renderTrend();
}

$("#trend-mode").addEventListener("change", () => renderTrend(selectedTrendMode()));
$("#watch-categories").addEventListener("click", (event) => {
  const categoryButton = eventElement(event)?.closest<HTMLButtonElement>("[data-category-id]");
  if (categoryButton) openCategoryDetails(categoryButton.dataset.categoryId);
});
renderDashboard();
refreshIcons();
