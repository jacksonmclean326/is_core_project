import { loadGoals } from "../../goals.js";
import {
  $,
  escapeHTML,
  eventElement,
  loadAccountPreferences,
  loadLinkedTransactions,
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
} from "../../core.js";
import {
  currentMonthKey,
  fullDateEyebrow,
  localDateString,
  monthName,
} from "../../../shared/months.js";
import { getBankConnections } from "../../api.js";
import "../../page-navigation.js";

type GraphMetric = "monthly-spending" | "category-spending" | "amount-saved" | "goal-remaining" | "friend-streaks";
type GraphType = "line" | "bar" | "donut";
type GraphDatum = { label: string; value: number };
type GraphData = {
  title: string;
  summary: string;
  caption: string;
  items: GraphDatum[];
  formatValue: (value: number) => string;
  note?: string;
  emptyMessage?: string;
  change?: { icon: string; text: string };
};

const graphStorageKey = "money-man-home-graph";
const graphMetrics: GraphMetric[] = [
  "monthly-spending",
  "category-spending",
  "amount-saved",
  "goal-remaining",
  "friend-streaks",
];
const graphTypes: GraphType[] = ["line", "bar", "donut"];
const chartColors = ["#2f6854", "#e7745a", "#537f9e", "#d5a33e", "#9b8cb4", "#a9bc9f", "#747f79"];

function loadGraphSettings(): { metric: GraphMetric; type: GraphType } {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(graphStorageKey) ?? "null");
    if (typeof saved === "object" && saved !== null) {
      const value = saved as { metric?: unknown; type?: unknown };
      return {
        metric: graphMetrics.includes(value.metric as GraphMetric) ? value.metric as GraphMetric : "monthly-spending",
        type: graphTypes.includes(value.type as GraphType) ? value.type as GraphType : "line",
      };
    }
  } catch {
    // Ignore unavailable or malformed browser preferences.
  }
  return { metric: "monthly-spending", type: "line" };
}

let graphSettings = loadGraphSettings();

function formatCurrency(value: number): string {
  return `${value < 0 ? "−" : ""}${money(value)}`;
}

function graphData(metric: GraphMetric): GraphData {
  const currencyValue = formatCurrency;
  if (metric === "monthly-spending") {
    const values = trendValues("spending");
    const current = values.at(-1) ?? 0;
    const previous = values.at(-2) ?? 0;
    const difference = current - previous;
    const relative = previous ? Math.round(Math.abs(difference / previous) * 100) : 0;
    return {
      title: "Spending by month",
      summary: currencyValue(current),
      caption: "spent this month",
      items: values.map((value, index) => ({ label: months[index] ?? "Month", value })),
      formatValue: currencyValue,
      change: {
        icon: difference <= 0 ? "arrow-down-right" : "arrow-up-right",
        text: `${relative}% from last month`,
      },
    };
  }

  if (metric === "category-spending") {
    return {
      title: "Total spending by category",
      summary: currencyValue(totalSpent()),
      caption: "spent across categories this month",
      items: state.categories
        .filter((category) => category.visible)
        .map((category) => ({ label: category.name, value: Math.max(0, Number(category.amount) || 0) })),
      formatValue: currencyValue,
    };
  }

  if (metric === "amount-saved") {
    const budget = Number(state.budget) || 0;
    if (!budget) {
      return {
        title: "Amount saved",
        summary: "Set a budget",
        caption: "to see your unspent budget",
        items: [],
        formatValue: currencyValue,
        emptyMessage: "Set a monthly budget in Settings to compare spending with your unspent budget.",
      };
    }
    const spent = totalSpent();
    const remaining = Math.max(0, budget - spent);
    return {
      title: "Amount saved",
      summary: currencyValue(remaining),
      caption: spent > budget ? "over budget this month" : "unspent budget this month",
      items: [
        { label: "Spent", value: spent },
        { label: "Budget left", value: remaining },
      ],
      formatValue: currencyValue,
      note: "Budget left is an estimate based on your budget minus recorded spending; it is not a bank savings balance.",
    };
  }

  if (metric === "goal-remaining") {
    const items = state.goals
      .filter((goal) => Number(goal.target) > 0)
      .map((goal) => ({
        label: goal.name,
        value: Math.max(0, Number(goal.target) - Number(goal.progress || 0)),
      }));
    const remaining = items.reduce((total, item) => total + item.value, 0);
    return {
      title: "Amount left in goals",
      summary: currencyValue(remaining),
      caption: items.length === 1 ? "left to reach your goal" : "left across your goals",
      items,
      formatValue: currencyValue,
      emptyMessage: "Add a savings goal on Details to chart how much is left.",
    };
  }

  const items = state.friends.map((friend) => ({ label: friend.name, value: Math.max(0, friend.streak) }));
  if (state.preferences.leaderboard) items.unshift({ label: "You", value: Math.max(1, state.streak) });
  return {
    title: "Friend streaks",
    summary: `${Math.max(1, state.streak)} days`,
    caption: "your current streak",
    items,
    formatValue: (value) => `${Math.round(value)} days`,
    note: "Friend streaks shown here use sample demo data, not live friend accounts or demographic data.",
    emptyMessage: "No friend streaks to compare yet.",
  };
}

function shortLabel(label: string): string {
  return label.length > 12 ? `${label.slice(0, 11)}…` : label;
}

function renderGraph(): void {
  const data = graphData(graphSettings.metric);
  const width = 850;
  const height = 220;
  const left = 38;
  const right = 818;
  const top = 18;
  const bottom = 174;
  const chart = $("#trend-chart");
  const legend = $("#chart-legend");
  const change = $("#trend-change");
  $("#graph-eyebrow").textContent = graphSettings.metric === "monthly-spending" ? "YOUR LAST SIX MONTHS" : "YOUR FINANCES";
  $("#trend-title").textContent = data.title;
  $("#trend-value").textContent = data.summary;
  $("#trend-caption").textContent = data.caption;
  $("#chart-note").textContent = data.note ?? "";
  $("#chart-note").hidden = !data.note;
  change.hidden = !data.change;
  if (data.change) {
    change.innerHTML = `<i data-icon="${data.change.icon}" aria-hidden="true"></i> ${escapeHTML(data.change.text)}`;
  }

  const total = data.items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  if (!data.items.length || (graphSettings.type === "donut" && total <= 0)) {
    chart.classList.add("is-empty");
    chart.classList.remove("is-donut");
    chart.setAttribute("aria-label", data.title);
    chart.innerHTML = `<p class="chart-empty">${escapeHTML(data.emptyMessage ?? "No data to chart yet.")}</p>`;
    legend.innerHTML = "";
    legend.hidden = true;
    refreshIcons();
    return;
  }

  chart.classList.remove("is-empty", "is-donut");
  chart.setAttribute("aria-label", `${data.title}, ${graphSettings.type} chart`);
  const grid = [0, 1, 2, 3]
    .map((step) => {
      const y = top + ((bottom - top) * step) / 3;
      return `<line class="chart-grid" x1="${left}" y1="${y}" x2="${right}" y2="${y}" />`;
    })
    .join("");
  const values = data.items.map((item) => Math.max(0, item.value));
  const maxValue = Math.max(1, ...values) * 1.12;
  const yFor = (value: number) => bottom - (value / maxValue) * (bottom - top);
  let chartMarkup = "";

  if (graphSettings.type === "line") {
    const points = data.items.map((item, index) => ({
      x: data.items.length === 1 ? (left + right) / 2 : left + ((right - left) * index) / (data.items.length - 1),
      y: yFor(item.value),
    }));
    const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
    const area = `${path} L${points.at(-1)?.x ?? right} ${bottom} L${points[0]?.x ?? left} ${bottom} Z`;
    const dots = points.map((point, index) =>
      `<circle class="chart-dot${index === points.length - 1 ? " current" : ""}" cx="${point.x}" cy="${point.y}" r="${index === points.length - 1 ? 5 : 4}" />`,
    ).join("");
    const labels = points.map((point, index) =>
      `<text class="chart-label" x="${point.x}" y="205" text-anchor="middle">${escapeHTML(shortLabel(data.items[index]?.label ?? ""))}</text>`,
    ).join("");
    chartMarkup = `<defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#8eaa96" stop-opacity=".32"/><stop offset="100%" stop-color="#8eaa96" stop-opacity=".015"/></linearGradient></defs>${grid}<path class="chart-area" d="${area}"/><path class="chart-line" d="${path}"/>${dots}${labels}`;
    legend.innerHTML = "";
    legend.hidden = true;
  } else if (graphSettings.type === "bar") {
    const slot = (right - left) / data.items.length;
    const barWidth = Math.min(48, slot * 0.52);
    const bars = data.items.map((item, index) => {
      const x = left + slot * index + (slot - barWidth) / 2;
      const y = yFor(item.value);
      const labelX = x + barWidth / 2;
      const valueY = Math.max(top + 12, y - 8);
      return `<rect class="chart-bar-track" x="${x}" y="${top}" width="${barWidth}" height="${bottom - top}" rx="${barWidth / 2}"/><rect class="chart-bar${index === data.items.length - 1 ? " is-last" : ""}" x="${x}" y="${y}" width="${barWidth}" height="${Math.max(0, bottom - y)}" rx="${barWidth / 2}"/><text class="chart-value" x="${labelX}" y="${valueY}" text-anchor="middle">${escapeHTML(data.formatValue(item.value))}</text><text class="chart-label" x="${labelX}" y="205" text-anchor="middle">${escapeHTML(shortLabel(item.label))}</text>`;
    }).join("");
    chartMarkup = `<defs><linearGradient id="chart-bar-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#6f9a7f"/><stop offset="100%" stop-color="#2f6854"/></linearGradient><linearGradient id="chart-bar-current" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#f09a78"/><stop offset="100%" stop-color="#e7745a"/></linearGradient></defs>${grid}${bars}`;
    legend.innerHTML = "";
    legend.hidden = true;
  } else {
    const radius = 72;
    const centerX = 140;
    const centerY = 110;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const circles = data.items.map((item, index) => {
      const segment = Math.max(0, item.value) / total * circumference;
      const visibleSegment = Math.max(0, segment - 3);
      const circle = `<circle class="chart-donut-ring" cx="${centerX}" cy="${centerY}" r="${radius}" stroke="${chartColors[index % chartColors.length]}" stroke-dasharray="${visibleSegment} ${circumference - visibleSegment}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${centerX} ${centerY})" />`;
      offset += segment;
      return circle;
    }).join("");
    chartMarkup = `<circle class="chart-donut-track" cx="${centerX}" cy="${centerY}" r="${radius}"/><g>${circles}</g><text class="chart-donut-total" x="${centerX}" y="${centerY + 5}">${escapeHTML(data.summary)}</text>`;
    legend.innerHTML = data.items.map((item, index) =>
      `<div class="chart-legend-item"><span class="chart-legend-swatch" style="--swatch:${chartColors[index % chartColors.length]}"></span><span class="chart-legend-label">${escapeHTML(item.label)}</span><strong class="chart-legend-value">${escapeHTML(data.formatValue(item.value))}</strong></div>`,
    ).join("");
    legend.hidden = false;
    chart.classList.add("is-donut");
    chart.innerHTML = `<svg viewBox="0 0 280 220" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${chartMarkup}</svg>`;
    refreshIcons();
    return;
  }

  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${chartMarkup}</svg>`;
  refreshIcons();
}

function graphEditorNote(metric: GraphMetric): string {
  if (metric === "friend-streaks") return "Friend streak values are sample demo data; demographic data is not collected.";
  if (metric === "amount-saved") return "Budget left is an estimate based on your monthly budget minus recorded spending.";
  if (metric === "goal-remaining" && !state.goals.length) return "Add a savings goal on Details to see its remaining amount.";
  return "Your graph choice is saved in this browser.";
}

function openGraphEditor(): void {
  $<HTMLSelectElement>("#graph-metric").value = graphSettings.metric;
  $<HTMLInputElement>(`input[name="graph-type"][value="${graphSettings.type}"]`).checked = true;
  $("#graph-editor-note").textContent = graphEditorNote(graphSettings.metric);
  $<HTMLDialogElement>("#graph-dialog").showModal();
}

$("#edit-graph").addEventListener("click", openGraphEditor);
$("#graph-metric").addEventListener("change", (event) => {
  const metric = (event.currentTarget as HTMLSelectElement).value as GraphMetric;
  $("#graph-editor-note").textContent = graphEditorNote(metric);
});
$("#graph-dialog").addEventListener("click", (event) => {
  const target = event.target;
  if (target === $("#graph-dialog") || eventElement(event)?.closest("[data-close-graph]")) {
    $<HTMLDialogElement>("#graph-dialog").close();
  }
});
$("#graph-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const metric = $<HTMLSelectElement>("#graph-metric").value as GraphMetric;
  const type = $<HTMLInputElement>('input[name="graph-type"]:checked').value as GraphType;
  graphSettings = { metric, type };
  try {
    localStorage.setItem(graphStorageKey, JSON.stringify(graphSettings));
  } catch {
    // The graph still updates for this visit when storage is unavailable.
  }
  renderGraph();
  $<HTMLDialogElement>("#graph-dialog").close();
});

function renderPeriodLabels() {
  const thisMonth = currentMonthKey();
  $("#today-label").textContent = fullDateEyebrow(localDateString());
  $("#period-label").textContent = `${monthName(thisMonth).toUpperCase()} OVERVIEW`;
}

function renderDashboard() {
  renderPeriodLabels();
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
  renderGraph();
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
    status.textContent = "Bank account data unavailable. Try Settings.";
  }
}

$("#graph-dialog").addEventListener("close", () => refreshIcons());
$("#watch-categories").addEventListener("click", (event) => {
  const categoryButton = eventElement(event)?.closest<HTMLButtonElement>("[data-category-id]");
  if (categoryButton) openCategoryDetails(categoryButton.dataset.categoryId);
});
primeFromSnapshot(currentMonthKey(), months.length - 1);
renderDashboard();
void loadAccountPreferences().then(renderDashboard).catch(() => {
  state.streak = 1;
  renderDashboard();
});
void loadLinkedTransactions(currentMonthKey(), months.length - 1).then((result) => {
  if (result === "linked") {
    renderDashboard();
    renderGraph();
  } else if (result === "error") {
    showToast("Could not load this month's bank transactions.");
  }
});
void loadBankAccountCount();
refreshIcons();
onDataChanged(() => {
  renderDashboard();
  renderGraph();
});

void loadGoals().then((goals) => {
  state.goals = goals;
  renderDashboard();
}).catch(() => {
  $("#dashboard-goal-name").textContent = "Unable to load your goals";
  $("#dashboard-goal-progress").textContent = "Refresh to try again";
});
