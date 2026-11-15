import {
  $,
  escapeHTML,
  eventElement,
  loadAccountPreferences,
  loadLinkedTransactions,
  loadSavedBudget,
  onDataChanged,
  primeFromSnapshot,
  months,
  money,
  openCategoryDetails,
  refreshIcons,
  showToast,
  shownCurrency,
  state,
  totalSpent,
  trendValues,
  usdToDisplay,
} from "../../core.js";
import {
  currentMonthKey,
  fullDateEyebrow,
  localDateString,
  monthName,
  shortMonthName,
} from "../../../shared/months.js";
import { getBankConnections, getLeaderboard, getSavingsRecord, type SavingsRecord } from "../../api.js";
import type { LeaderboardEntry } from "../../../shared/leaderboard.js";
import { loadGoals } from "../../goals.js";
import "../../page-navigation.js";

type GraphMetric = "monthly-spending" | "category-spending" | "amount-saved" | "goal-remaining" | "friend-points";
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
  "friend-points",
];
const graphTypes: GraphType[] = ["line", "bar", "donut"];
const chartColors = ["#2f6854", "#e7745a", "#537f9e", "#d5a33e", "#9b8cb4", "#a9bc9f", "#747f79"];

function loadGraphSettings(): { metric: GraphMetric; type: GraphType } {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(graphStorageKey) ?? "null");
    if (typeof saved === "object" && saved !== null) {
      const value = saved as { metric?: unknown; type?: unknown };
      // The old sample-data "friend-streaks" graph became real friends' goal points.
      if (value.metric === "friend-streaks") value.metric = "friend-points";
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

/** Friends' leaderboard scores for the goal points graph: null until loaded. */
let friendScores: LeaderboardEntry[] | null = null;
let friendScoresFailed = false;
async function loadFriendScores(): Promise<void> {
  try {
    friendScores = (await getLeaderboard()).entries;
    friendScoresFailed = false;
  } catch {
    friendScoresFailed = true;
  }
  if (graphSettings.metric === "friend-points") renderGraph();
}
if (graphSettings.metric === "friend-points") void loadFriendScores();

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

  // Real friends' goal points, the same numbers as the Friends leaderboard.
  const ranked = (friendScores ?? []).filter((entry) => entry.score !== null);
  const you = (friendScores ?? []).find((entry) => entry.isYou);
  return {
    title: "Friends' goal points",
    summary: you?.score != null ? `${you.score.toLocaleString("en-US")} pts` : friendScores ? "Unranked" : "–",
    caption: you?.score != null ? "your goal points (out of 1,000)" : "add goals to earn points",
    items: ranked.map((entry) => ({ label: entry.isYou ? "You" : entry.name, value: entry.score ?? 0 })),
    formatValue: (value) => `${Math.round(value).toLocaleString("en-US")} pts`,
    note: "Points come from average goal progress, the same as the Friends leaderboard.",
    emptyMessage: friendScores === null
      ? (friendScoresFailed ? "Couldn't load your friends' scores. Try again in a moment." : "Loading your friends' scores…")
      : "Add friends on the Friends tab to compare goal points.",
  };
}

function shortLabel(label: string, maxChars = 12): string {
  const limit = Math.max(3, maxChars);
  return label.length > limit ? `${label.slice(0, limit - 1)}…` : label;
}

/** "$4.3K" style amounts for axis ticks and narrow bars. */
function compactValue(metric: GraphMetric, value: number): string {
  if (metric === "friend-points") return `${Math.round(value)}`;
  const shown = usdToDisplay(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: shownCurrency(),
    notation: "compact",
    maximumFractionDigits: Math.abs(shown) >= 1000 ? 1 : 0,
  }).format(shown);
}

/** Rough width of chart text in pixels (12-13px system font), so labels can be shortened or skipped before they collide. */
const textWidth = (text: string) => text.length * 7;

/** A round top for the y axis (and its three steps), so gridlines land on numbers like 1,500 instead of 1,437. */
function niceScale(maxValue: number): { max: number; step: number } {
  const raw = Math.max(maxValue, 1) / 3;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= raw) ?? 10) * magnitude;
  return { max: step * 3, step };
}

function renderGraph(): void {
  const data = graphData(graphSettings.metric);
  const chart = $("#trend-chart");
  // Draw at the chart's real size. Stretching a fixed drawing to fit squashed the text, dots and bars on
  // narrow screens; drawing 1:1 keeps them true at every width.
  const width = Math.max(240, Math.round(chart.clientWidth) || 850);
  const height = Math.max(140, Math.round(chart.clientHeight) || 220);
  lastChartWidth = chart.clientWidth;
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
  const values = data.items.map((item) => Math.max(0, item.value));
  // Leave headroom above the tallest point for its value label, then round the axis up to a tidy number.
  const scale = niceScale(Math.max(...values, 0) * 1.08);
  const ticks = [0, 1, 2, 3].map((step) => step * scale.step);
  const tickLabels = ticks.map((tick) => compactValue(graphSettings.metric, tick));
  const left = Math.max(...tickLabels.map(textWidth)) + 14;
  const right = width - 12;
  const top = 16;
  const bottom = height - 30;
  const labelY = height - 9;
  const yFor = (value: number) => bottom - (value / scale.max) * (bottom - top);
  const grid = ticks
    .map((tick, index) => {
      const y = yFor(tick);
      return `<line class="chart-grid" x1="${left}" y1="${y}" x2="${right}" y2="${y}" /><text class="chart-axis" x="${left - 8}" y="${y + 4}" text-anchor="end">${escapeHTML(tickLabels[index] ?? "")}</text>`;
    })
    .join("");
  const slot = (right - left) / data.items.length;
  // Bottom labels: shorten them to the space each one has, and if even short ones would touch, show every few.
  const maxChars = Math.floor((slot - 6) / 7);
  const labelEvery = maxChars >= 3 ? 1 : Math.ceil(28 / Math.max(slot, 1));
  const bottomLabel = (x: number, index: number) =>
    index % labelEvery === 0 || index === data.items.length - 1
      ? `<text class="chart-label" x="${x}" y="${labelY}" text-anchor="middle">${escapeHTML(shortLabel(data.items[index]?.label ?? "", Math.min(12, Math.max(maxChars, Math.floor((slot * labelEvery - 6) / 7)))))}</text>`
      : "";
  let chartMarkup = "";

  if (graphSettings.type === "line") {
    const inset = Math.min(24, slot / 2);
    const points = data.items.map((item, index) => ({
      x: data.items.length === 1 ? (left + right) / 2 : left + inset + ((right - left - inset * 2) * index) / (data.items.length - 1),
      y: yFor(item.value),
    }));
    const path = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
    const area = `${path} L${points.at(-1)?.x ?? right} ${bottom} L${points[0]?.x ?? left} ${bottom} Z`;
    const dots = points.map((point, index) =>
      `<circle class="chart-dot${index === points.length - 1 ? " current" : ""}" cx="${point.x}" cy="${point.y}" r="${index === points.length - 1 ? 5 : 4}" />`,
    ).join("");
    const labels = points.map((point, index) => bottomLabel(point.x, index)).join("");
    chartMarkup = `<defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#8eaa96" stop-opacity=".32"/><stop offset="100%" stop-color="#8eaa96" stop-opacity=".015"/></linearGradient></defs>${grid}<path class="chart-area" d="${area}"/><path class="chart-line" d="${path}"/>${dots}${labels}`;
    legend.innerHTML = "";
    legend.hidden = true;
  } else if (graphSettings.type === "bar") {
    const barWidth = Math.max(4, Math.min(44, slot * 0.58));
    const bars = data.items.map((item, index) => {
      const x = left + slot * index + (slot - barWidth) / 2;
      const y = yFor(item.value);
      const labelX = x + barWidth / 2;
      const valueY = Math.max(top + 10, y - 7);
      // The full amount if it fits over the bar, "$4.3K" if that fits, otherwise nothing (the axis still reads it).
      const full = data.formatValue(item.value);
      const compact = compactValue(graphSettings.metric, item.value);
      const valueText = textWidth(full) <= slot - 4 ? full : textWidth(compact) <= slot - 2 ? compact : "";
      const radius = Math.min(barWidth / 2, 10);
      return `<rect class="chart-bar-track" x="${x}" y="${top}" width="${barWidth}" height="${bottom - top}" rx="${radius}"/><rect class="chart-bar${index === data.items.length - 1 ? " is-last" : ""}" x="${x}" y="${y}" width="${barWidth}" height="${Math.max(0, bottom - y)}" rx="${radius}"/>${
        valueText ? `<text class="chart-value" x="${labelX}" y="${valueY}" text-anchor="middle">${escapeHTML(valueText)}</text>` : ""
      }${bottomLabel(labelX, index)}`;
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

  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">${chartMarkup}</svg>`;
  refreshIcons();
}

// Redraw when the chart's width changes (window resize, rotating a phone), since it is drawn at its real size.
let lastChartWidth = 0;
let resizeFrame = 0;
if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => {
    const chart = document.getElementById("trend-chart");
    if (!chart || Math.abs(chart.clientWidth - lastChartWidth) < 2) return;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(renderGraph);
  }).observe($("#trend-chart"));
}

function graphEditorNote(metric: GraphMetric): string {
  if (metric === "friend-points") return "Compare goal points with your friends. Points match the Friends leaderboard.";
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
  if (metric === "friend-points") void loadFriendScores();
});

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
  $("#budget-total").textContent = budget ? money(budget) : "Not set";
  $("#spent-total").textContent = money(spent);
  $("#remaining-total").textContent = budget
    ? `${remaining < 0 ? "−" : ""}${money(remaining)}`
    : "–";
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
    status.textContent = "Bank account data unavailable. Try the Accounts tab.";
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
  if (result === "linked" || result === "sample") dataMode = result === "linked" ? "data" : "empty";
  if (result === "linked" || result === "sample") {
    renderDashboard();
    renderGraph();
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
  renderGraph();
});

void loadGoals().then((goals) => {
  state.goals = goals;
  renderDashboard();
}).catch(() => {
  showToast("Could not load your goals for the home graph.");
});

// The user's own savings record: did they meet their Savings and Spending goals each of the last 4 months?
async function loadSavingsRecord(): Promise<void> {
  const card = $("#savings-record");
  let record: SavingsRecord;
  try {
    record = await getSavingsRecord();
  } catch {
    card.hidden = true; // not set up on this server yet, or offline: leave the card out
    return;
  }
  const plural = (count: number) => (count === 1 ? "month" : "months");
  $("#record-months").innerHTML = record.months
    .map((month) => {
      const status = month.met === null ? "is-empty" : month.met ? "is-met" : "is-missed";
      const text = month.met === null ? "–" : month.met ? "Met" : "Missed";
      const detail = month.met === null ? "nothing to check" : `${month.goalsMet} of ${month.goalsCounted} goals met`;
      return `<li class="record-month ${status}" aria-label="${escapeHTML(`${monthName(month.month)}: ${text === "–" ? "nothing to check" : text}, ${detail}`)}"><span>${escapeHTML(shortMonthName(month.month))}</span><strong>${text}</strong></li>`;
    })
    .join("");
  let title: string;
  let note: string;
  if (!record.hasGoals) {
    title = "Start your savings record";
    note = "Add a Savings or Spending goal on Details to see how you do each month.";
  } else if (!record.tracked) {
    title = "Your record starts soon";
    note = "Each finished month with goals and spending is added here.";
  } else {
    title = `Met your goals ${record.met} of the last ${record.tracked} ${plural(record.tracked)}`;
    note = record.consistent
      ? "That's consistent saving. Keep it up!"
      : `Meet your goals in ${record.needed} of the last ${record.window} months to be a consistent saver.`;
  }
  $("#record-title").textContent = title;
  $("#record-note").textContent = note;
  card.hidden = false;
}
void loadSavingsRecord();
