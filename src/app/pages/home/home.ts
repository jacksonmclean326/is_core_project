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
import { getBankConnections, getHomeTrends, getLeaderboard, getSavingsRecord, type HomeTrendsResponse, type SavingsRecord } from "../../api.js";
import type { LeaderboardEntry, MonthlyChallenge } from "../../../shared/leaderboard.js";
import { loadGoals } from "../../goals.js";
import "../../page-navigation.js";

type GraphMetric = "monthly-spending" | "amount-saved" | "friend-points";
type GraphDatum = { label: string; value: number };
type GraphSeries = { label: string; color: string; values: GraphDatum[]; isYou?: boolean };
type GraphData = {
  title: string;
  summary: string;
  caption: string;
  items: GraphDatum[];
  note?: string;
  emptyMessage?: string;
  change?: { icon: string; text: string };
  series?: GraphSeries[];
};

const graphStorageKey = "money-man-home-graph";
const graphMetrics: GraphMetric[] = ["monthly-spending", "friend-points", "amount-saved"];
const chartColors = ["#2f6854", "#e7745a", "#537f9e", "#d5a33e", "#9b8cb4", "#a9bc9f", "#747f79"];
function loadGraphSettings(): { metric: GraphMetric } {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(graphStorageKey) ?? "null");
    if (typeof saved === "object" && saved !== null) {
      const value = saved as { metric?: unknown; version?: unknown };
      const metric = value.version === 2 && graphMetrics.includes(value.metric as GraphMetric)
        ? value.metric as GraphMetric
        : "monthly-spending";
      return { metric };
    }
  } catch {
    // Ignore unavailable or malformed browser preferences.
  }
  return { metric: "monthly-spending" };
}

let graphSettings = loadGraphSettings();
$<HTMLSelectElement>("#graph-metric").value = graphSettings.metric;
let graphPeriod: "monthly" | "daily" = "monthly";
let homeTrends: HomeTrendsResponse | null = null;
void getHomeTrends(currentMonthKey(), localDateString()).then(result => { homeTrends = result; renderGraph(); }).catch(() => { homeTrends = null; });

/** Friends' normalized challenge scores: null until loaded. */
let friendScores: LeaderboardEntry[] | null = null;
let friendChallenge: MonthlyChallenge | null = null;
let friendScoresFailed = false;
async function loadFriendScores(): Promise<void> {
  try {
    const result = await getLeaderboard();
    friendScores = result.entries;
    friendChallenge = result.challenge;
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
    const values = graphPeriod === "daily"
      ? (homeTrends?.daily ?? []).map(row => row.spent)
      : homeTrends?.monthly.map(row => row.spent) ?? trendValues("spending");
    const current = values.at(-1) ?? 0;
    const comparison = graphPeriod === "daily"
      ? homeTrends?.previousDaily.find(row => row.label === String(values.length).padStart(2,"0"))?.value
      : values.at(-2);
    const previous = comparison ?? 0;
    const difference = current - previous;
    const relative = previous ? Math.round(Math.abs(difference / previous) * 100) : 0;
    return {
      title: graphPeriod === "daily" ? "Daily spending this month" : "Spending by month",
      summary: currencyValue(current),
      caption: graphPeriod === "daily" ? "spent today" : "spent this month",
      items: values.map((value, index) => ({ label: graphPeriod === "daily" ? String(index + 1) : homeTrends?.monthly[index]?.label.slice(5) ?? months[index] ?? "Month", value })),
      ...(graphPeriod === "daily" && homeTrends && $<HTMLInputElement>("#show-last-month").checked ? { series: [
        { label: "This month", color: chartColors[0]!, values: homeTrends.daily.map(row => ({ label: row.label, value: row.spent })), isYou: true },
        { label: "Last month", color: chartColors[2]!, values: homeTrends.previousDaily },
      ] } : {}),
      ...(graphPeriod === "daily" ? { note: "Each point is that day's spending total, compared with the same day last month." } : {}),
      ...(comparison !== undefined ? { change: {
        icon: difference <= 0 ? "arrow-down-right" : "arrow-up-right",
        text: `${relative}% from ${graphPeriod === "daily" ? "the same day last month" : "last month"}`,
      } } : {}),
    };
  }

  if (metric === "amount-saved") {
    const budget = Number(state.budget) || 0;
    const timeline = graphPeriod === "daily" ? homeTrends?.daily ?? [] : homeTrends?.monthly ?? [];
    if (!budget && !timeline.length) {
      return {
        title: "Amount saved",
        summary: "Set a budget",
        caption: "to see your unspent budget",
        items: [],
        emptyMessage: "Set a monthly budget in Settings to compare spending with your unspent budget.",
      };
    }
    const spent = totalSpent();
    const remaining = timeline.at(-1)?.saved ?? Math.max(0, budget - spent);
    return {
      title: "Total amount saved",
      summary: currencyValue(remaining),
      caption: "estimated income remaining after recorded spending",
      items: timeline.map(row => ({ label: row.label, value: row.saved })),
      note: "Budget left is an estimate based on your budget minus recorded spending; it is not a bank savings balance.",
    };
  }

  // Normalized monthly challenge percentages, the same privacy-safe scores as the Friends page.
  const seriesRows = graphPeriod === "daily" ? homeTrends?.friendsDaily ?? [] : homeTrends?.friendsMonthly ?? [];
  const ranked = friendScores ?? [];
  const you = (friendScores ?? []).find((entry) => entry.isYou);
  return {
    title: graphPeriod === "daily" ? "Daily challenge progress" : "Challenge scores over six months",
    summary: you ? `${Math.floor(you.score)}%` : friendScores ? "–" : "–",
    caption: you ? "your normalized challenge score" : "enable visibility to appear",
    items: seriesRows[0]?.values ?? ranked.map((entry) => ({ label: entry.isYou ? "You" : entry.name, value: entry.score ?? 0 })),
    series: seriesRows.map((row,index)=>({label:row.isYou ? "You" : row.name,color:chartColors[index%chartColors.length],values:row.values,isYou:row.isYou})),
    note: friendChallenge
      ? `Normalized challenge scores; challenge rules can vary by month. Current challenge: ${friendChallenge.title}. No financial amounts are shared.`
      : "Normalized challenge scores; no financial amounts are shared.",
    emptyMessage: friendScores === null
      ? (friendScoresFailed ? "Couldn't load your friends' scores. Try again in a moment." : "Loading your friends' scores…")
      : "Add friends on the Friends tab to compare monthly challenge progress.",
  };
}

function shortLabel(label: string, maxChars = 12): string {
  const limit = Math.max(3, maxChars);
  return label.length > limit ? `${label.slice(0, limit - 1)}…` : label;
}

/** "$4.3K" style amounts for axis ticks and narrow bars. */
function compactValue(metric: GraphMetric, value: number): string {
  if (metric === "friend-points") return `${Math.floor(value)}%`;
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
  $("#last-month-toggle").hidden = graphSettings.metric !== "monthly-spending" || graphPeriod !== "daily";
  const change = $("#trend-change");
  $("#graph-eyebrow").textContent = graphPeriod === "daily" ? "THIS MONTH, BY DAY" : "YOUR LAST SIX MONTHS";
  $("#trend-title").textContent = data.title;
  $("#trend-value").textContent = data.summary;
  $("#trend-caption").textContent = data.caption;
  $("#chart-note").textContent = data.note ?? "";
  $("#chart-note").hidden = !data.note;
  change.hidden = !data.change;
  if (data.change) {
    change.innerHTML = `<i data-icon="${data.change.icon}" aria-hidden="true"></i> ${escapeHTML(data.change.text)}`;
  }
  if (!data.items.length) {
    chart.classList.add("is-empty");
    chart.setAttribute("aria-label", data.title);
    chart.innerHTML = `<p class="chart-empty">${escapeHTML(data.emptyMessage ?? "No data to chart yet.")}</p>`;
    legend.innerHTML = "";
    legend.hidden = true;
    refreshIcons();
    return;
  }

  chart.classList.remove("is-empty");
  chart.setAttribute("aria-label", `${data.title}, line chart`);
  const allSeries = data.series?.length ? data.series : [{ label: "", color: chartColors[0]!, values: data.items }];
  const values = allSeries.flatMap(series => series.values.map(item => Math.max(0,item.value)));
  // Round the axis to a tidy number above the highest point.
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
  const inset = Math.min(24, slot / 2);
  const count = Math.max(...allSeries.map((series) => series.values.length));
  const xFor = (index: number) => count === 1
    ? (left + right) / 2
    : left + inset + ((right - left - inset * 2) * index) / (count - 1);
  const lines = allSeries.map((series, seriesIndex) => {
    const points = series.values.map((item, index) => ({ x: xFor(index), y: yFor(item.value) }));
    const path = points
      .map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
      .join(" ");
    const dots = points
      .map((point, index) =>
        `<circle cx="${point.x}" cy="${point.y}" r="${index === points.length - 1 ? 4.5 : 3.5}" fill="${series.color}" stroke="white" stroke-width="1.5"/>`,
      )
      .join("");
    const labels = seriesIndex === 0 ? points.map((point, index) => bottomLabel(point.x, index)).join("") : "";
    return `<path d="${path}" fill="none" stroke="${series.color}" stroke-width="${series.isYou ? 3.5 : 2.5}" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}`;
  }).join("");
  const chartMarkup = `${grid}${lines}`;
  if (data.series?.length) {
    legend.innerHTML = allSeries
      .map((series) => `<div class="chart-legend-item"><span class="chart-legend-swatch" style="--swatch:${series.color}"></span><span class="chart-legend-label">${escapeHTML(series.label)}</span></div>`)
      .join("");
    legend.hidden = false;
  } else {
    legend.innerHTML = "";
    legend.hidden = true;
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

document.querySelectorAll<HTMLButtonElement>("[data-graph-period]").forEach((button) => {
  button.addEventListener("click", () => {
    graphPeriod = button.dataset.graphPeriod === "daily" ? "daily" : "monthly";
    document.querySelectorAll<HTMLButtonElement>("[data-graph-period]").forEach((option) => {
      option.setAttribute("aria-pressed", String(option === button));
    });
    renderGraph();
  });
});

$("#show-last-month").addEventListener("change", renderGraph);
$("#graph-metric").addEventListener("change", (event) => {
  const metric = (event.currentTarget as HTMLSelectElement).value as GraphMetric;
  graphSettings = { metric };
  try {
    localStorage.setItem(graphStorageKey, JSON.stringify({ ...graphSettings, version: 2 }));
  } catch {
    // The graph still updates for this visit when storage is unavailable.
  }
  renderGraph();
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
