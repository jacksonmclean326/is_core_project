const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const palette = ["#2f6854", "#e7745a", "#537f9e", "#d5a33e", "#9b8cb4", "#a9bc9f", "#d9d5c7"];
const storageKey = "money-man-prototype";
const legacyStorageKey = "monarch-prototype";

const initialState = {
  budget: 2200,
  income: 3200,
  streak: 12,
  friendSeedVersion: 1,
  categories: [
    { id: "housing", name: "Housing", amount: 690, limit: 900, color: palette[0], visible: true },
    { id: "food", name: "Food", amount: 276, limit: 300, color: palette[1], visible: true },
    { id: "transport", name: "Transport", amount: 104, limit: 180, color: palette[2], visible: true },
    { id: "utilities", name: "Utilities", amount: 120, limit: 160, color: palette[3], visible: true },
    { id: "education", name: "Education", amount: 96, limit: 140, color: palette[4], visible: true },
    { id: "personal", name: "Personal", amount: 184, limit: 250, color: palette[5], visible: true },
    { id: "other", name: "Other", amount: 270, limit: 350, color: palette[6], visible: true }
  ],
  goals: [
    { id: "savings", kind: "Savings", name: "A little breathing room", target: 400, progress: 315 },
    { id: "spending", kind: "Spending", name: "Keep eating out in check", target: 120, progress: 84 },
    { id: "earnings", kind: "Earnings", name: "Weekend shift fund", target: 250, progress: 175 }
  ],
  friends: [
    { id: "alex", name: "Alex Lee", initials: "AL", points: 820, streak: 12, color: "sage" },
    { id: "casey", name: "Casey Nguyen", initials: "CN", points: 760, streak: 10, color: "coral" },
    { id: "morgan", name: "Morgan Shaw", initials: "MS", points: 710, streak: 8, color: "blue" },
    { id: "sam", name: "Sam Patel", initials: "SP", points: 650, streak: 6, color: "sage" },
    { id: "riley", name: "Riley Chen", initials: "RC", points: 590, streak: 4, color: "blue" }
  ],
  accounts: [
    { id: "checking", institution: "Chase Checking", detail: "•••• 2841 · Checking", balance: 2148 },
    { id: "card", institution: "Discover Card", detail: "•••• 1906 · Credit card", balance: -386 }
  ],
  preferences: { sync: true, reminders: true, leaderboard: true },
  profile: { name: "Jordan Davis", email: "jordan.davis@email.com" },
  friendCode: "PEN-4827"
};

function loadState() {
  try {
    const savedValue = localStorage.getItem(storageKey) || localStorage.getItem(legacyStorageKey);
    const saved = JSON.parse(savedValue);
    if (!saved || typeof saved !== "object") return structuredClone(initialState);
    const savedFriends = Array.isArray(saved.friends) ? saved.friends : [];
    const sampleFriendIds = new Set(initialState.friends.map((friend) => friend.id));
    const friends = Number(saved.friendSeedVersion) >= 1
      ? savedFriends
      : [
          ...initialState.friends.map((friend) => savedFriends.find((savedFriend) => savedFriend.id === friend.id) || friend),
          ...savedFriends.filter((friend) => !sampleFriendIds.has(friend.id))
        ];
    return {
      ...structuredClone(initialState),
      ...saved,
      friendSeedVersion: 1,
      categories: initialState.categories.map((category) => ({
        ...category,
        ...(saved.categories || []).find((item) => item.id === category.id)
      })),
      goals: Array.isArray(saved.goals) ? saved.goals : structuredClone(initialState.goals),
      friends,
      accounts: Array.isArray(saved.accounts) ? saved.accounts : structuredClone(initialState.accounts),
      preferences: { ...initialState.preferences, ...saved.preferences },
      profile: { ...initialState.profile, ...saved.profile }
    };
  } catch {
    return structuredClone(initialState);
  }
}

const state = loadState();
const months = ["May", "Jun", "Jul", "Aug", "Sep", "Oct"];
const trends = {
  spending: { values: [1920, 1880, 2050, 1800, 1890, 1740], caption: "spent this month", format: (value) => currency.format(value) },
  under: { values: [13, 18, 7, 15, 14, 21], caption: "under budget this month", format: (value) => `${value}%` },
  saved: { values: [240, 290, 190, 330, 310, 460], caption: "saved this month", format: (value) => currency.format(value) }
};
const transactions = {
  housing: [["Campus apartment", "$540"], ["Campus parking", "$90"], ["Renter's insurance", "$60"]],
  food: [["Green Market", "$74"], ["Cedar Cafe", "$48"], ["Grocery Co-op", "$154"]],
  transport: [["City transit pass", "$68"], ["Ride share", "$36"]],
  utilities: [["Electric company", "$74"], ["Internet", "$46"]],
  education: [["Campus bookstore", "$58"], ["Print services", "$38"]],
  personal: [["Corner pharmacy", "$43"], ["Clothing store", "$82"], ["Streaming", "$59"]],
  other: [["Coffee shop", "$32"], ["Campus event", "$48"], ["Other purchases", "$190"]]
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const totalSpent = () => state.categories.reduce((total, category) => total + Number(category.amount || 0), 0);
const money = (amount) => currency.format(Math.abs(Number(amount) || 0));
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const refreshIcons = () => window.lucide?.createIcons();

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 3400);
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function showPage(pageName) {
  $$("[data-page]").forEach((page) => {
    const active = page.dataset.page === pageName;
    page.hidden = !active;
    page.classList.toggle("is-active", active);
  });
  $$(".nav-item").forEach((button) => {
    const active = button.dataset.view === pageName;
    button.classList.toggle("is-current", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
  refreshIcons();
}

function renderTrend(mode = $("#trend-mode").value) {
  const trend = trends[mode];
  const values = [...trend.values];
  const budget = Number(state.budget) || 0;
  const spent = totalSpent();
  if (mode === "spending") values[values.length - 1] = spent;
  if (mode === "under") values[values.length - 1] = budget ? Math.max(0, Math.round((budget - spent) / budget * 100)) : 0;
  if (mode === "saved") values[values.length - 1] = budget ? Math.max(0, budget - spent) : 0;
  const current = values.at(-1);
  const previous = values.at(-2);
  const difference = current - previous;
  const relative = previous ? Math.round(Math.abs(difference / previous) * 100) : 0;
  const positive = mode === "under" || mode === "saved" ? difference >= 0 : difference <= 0;
  const trendIcon = mode === "spending" ? (difference <= 0 ? "arrow-down-right" : "arrow-up-right") : (difference >= 0 ? "arrow-up-right" : "arrow-down-right");
  $("#trend-value").textContent = trend.format(current);
  $("#trend-caption").textContent = mode !== "spending" && !budget ? "set a budget to see this trend" : trend.caption;
  $("#trend-change").innerHTML = `<i data-lucide="${trendIcon}" aria-hidden="true"></i> ${mode === "under" ? `${Math.abs(difference)} pts` : `${relative}%`} from last month`;

  const width = 850;
  const height = 220;
  const left = 33;
  const right = 828;
  const top = 20;
  const bottom = 176;
  const min = Math.min(...values) * 0.82;
  const max = Math.max(...values) * 1.08;
  const points = values.map((value, index) => ({
    x: left + (right - left) * index / (values.length - 1),
    y: bottom - ((value - min) / (max - min)) * (bottom - top)
  }));
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${right} ${bottom} L${left} ${bottom} Z`;
  const grid = [0, 1, 2, 3].map((step) => {
    const y = top + (bottom - top) * step / 3;
    return `<line class="chart-grid" x1="${left}" y1="${y}" x2="${right}" y2="${y}" />`;
  }).join("");
  const dots = points.map((point, index) => `<circle class="chart-dot${index === points.length - 1 ? " current" : ""}" cx="${point.x}" cy="${point.y}" r="${index === points.length - 1 ? 5 : 4}" />`).join("");
  const labels = points.map((point, index) => `<text class="chart-label" x="${point.x}" y="205" text-anchor="middle">${months[index]}</text>`).join("");
  const label = mode === "under" ? "Percent under budget" : mode === "saved" ? "Amount saved" : "Monthly spending";
  $("#trend-chart").setAttribute("aria-label", `${label}, May through October`);
  $("#trend-chart").innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#8eaa96" stop-opacity=".32"/><stop offset="100%" stop-color="#8eaa96" stop-opacity=".015"/></linearGradient></defs>${grid}<path class="chart-area" d="${areaPath}"/><path class="chart-line" d="${linePath}"/><line class="chart-guide" x1="${points.at(-1).x}" y1="${top}" x2="${points.at(-1).x}" y2="${bottom}"/>${dots}${labels}</svg>`;
  refreshIcons();
}

function renderDashboard() {
  const spent = totalSpent();
  const budget = Number(state.budget) || 0;
  const remaining = budget - spent;
  $("#streak-count").textContent = state.streak || 0;
  $(".streak-indicator").setAttribute("aria-label", `${state.streak || 0} day streak`);
  $("#sync-account-count").textContent = state.accounts.length;
  $("#budget-total").textContent = budget ? money(budget) : "NO BUDGET";
  $("#spent-total").textContent = money(spent);
  $("#remaining-total").textContent = budget ? `${remaining < 0 ? "-" : ""}${money(remaining)}` : "NO BUDGET";
  const used = budget ? Math.min(100, spent / budget * 100) : 0;
  $("#budget-progress").style.width = `${used}%`;
  $(".budget-track").setAttribute("aria-label", budget ? `${Math.round(used)} percent of monthly budget used` : "No monthly budget set");

  const watched = state.categories.filter((category) => category.limit && category.amount / category.limit >= 0.75).sort((first, second) => second.amount / second.limit - first.amount / first.limit);
  $("#watch-categories").innerHTML = watched.length ? watched.map((category) => `<div class="watch-item"><button type="button" data-category-id="${category.id}">${escapeHTML(category.name)}</button><span class="watch-amount">${Math.round(category.amount / category.limit * 100)}%</span></div>`).join("") : `<span class="watch-empty">Nothing near its limit right now.</span>`;
  const goal = state.goals.find((item) => item.kind === "Savings") || state.goals[0];
  if (goal) {
    $("#dashboard-goal-name").textContent = goal.name;
    $("#dashboard-goal-progress").innerHTML = `${money(goal.progress)} <span>of ${money(goal.target)}</span>`;
    $("#dashboard-goal-track").style.width = `${Math.min(100, goal.progress / goal.target * 100)}%`;
  } else {
    $("#dashboard-goal-name").textContent = "Add a goal to get started";
    $("#dashboard-goal-progress").textContent = "No goal set";
    $("#dashboard-goal-track").style.width = "0%";
  }
  renderTrend();
}

function renderSummary() {
  const spent = totalSpent();
  const visible = state.categories.filter((category) => category.visible);
  const chartSpent = visible.reduce((total, category) => total + Number(category.amount || 0), 0);
  const budget = Number(state.budget) || 0;
  $("#summary-spent").textContent = money(spent);
  $("#summary-budget").textContent = budget ? money(budget) : "NO BUDGET";
  $("#summary-available").textContent = budget ? money(Math.max(0, budget - spent)) : "Set a budget";
  $("#donut-center-label").textContent = "THIS MONTH";
  $("#donut-total").textContent = money(chartSpent);
  $("#donut-center-subtitle").textContent = "across categories";
  $("#donut-chart").classList.remove("is-previewing");
  delete $("#donut-chart").dataset.previewCategory;
  let start = 0;
  const slices = visible.map((category) => {
    const end = start + (chartSpent ? category.amount / chartSpent * 100 : 0);
    const slice = `${category.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    start = end;
    return slice;
  });
  const circumference = 2 * Math.PI * 87;
  let dashOffset = 0;
  $("#donut-slices").innerHTML = visible.map((category) => {
    const length = chartSpent ? Number(category.amount) / chartSpent * circumference : 0;
    const circle = `<circle class="donut-slice" data-category-id="${category.id}" cx="110" cy="110" r="87" fill="none" stroke="${category.color}" stroke-width="46" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-dashOffset}" transform="rotate(-90 110 110)" />`;
    dashOffset += length;
    return circle;
  }).join("");
  $("#donut-chart").style.background = "transparent";
  $("#donut-chart").setAttribute("aria-label", `Interactive chart. Focus and use arrow keys to preview a category; press Enter for details. Monthly spending of ${money(chartSpent)}. ${visible.map((category) => `${category.name}, ${money(category.amount)}`).join(". ")}`);
  $("#category-legend").innerHTML = visible.map((category) => `<button class="legend-row" type="button" data-category-id="${category.id}"><span class="legend-swatch" style="background:${category.color}"></span><span>${escapeHTML(category.name)}</span></button>`).join("");
  $("#top-category-list").innerHTML = [...visible].sort((first, second) => second.amount - first.amount).slice(0, 3).map((category) => {
    const percent = chartSpent ? Math.round(category.amount / chartSpent * 100) : 0;
    return `<div class="top-category-row"><button class="top-category-name" type="button" data-category-id="${category.id}"><span class="legend-swatch" style="background:${category.color}"></span>${escapeHTML(category.name)}</button><span class="top-category-values">${money(category.amount)} <strong>${percent}%</strong></span><div class="top-category-track"><span style="width:${percent}%;background:${category.color}"></span></div></div>`;
  }).join("") || `<p class="watch-empty">Choose a category in Edit to show it here.</p>`;
  $("#goal-card-list").innerHTML = state.goals.length ? state.goals.map((goal) => {
    const progress = goal.target ? Math.min(100, goal.progress / goal.target * 100) : 0;
    return `<article class="goal-card"><div class="goal-card-top"><span class="goal-kind">${escapeHTML(goal.kind)} goal</span><i data-lucide="target" aria-hidden="true"></i></div><strong>${escapeHTML(goal.name)}</strong><div class="mini-track"><span style="width:${progress}%"></span></div><div class="goal-amounts"><span>${money(goal.progress)} toward goal</span><span>${money(goal.target)} goal</span></div></article>`;
  }).join("") : `<p class="watch-empty">Add a goal to see your progress here.</p>`;
  refreshIcons();
}

function renderLeaderboard() {
  const friends = [
    ...state.friends.map((friend) => ({ ...friend })),
    { id: "you", name: state.profile.name, initials: "JD", points: 940, streak: 16, color: "coral", isYou: true }
  ].sort((first, second) => second.points - first.points);
  $("#friend-list").innerHTML = friends.map((friend) => `<div class="friend-row"><span class="friend-avatar avatar-${friend.color}">${escapeHTML(friend.initials)}</span><span class="friend-name">${escapeHTML(friend.name)}${friend.isYou ? " (you)" : ""}</span><span class="friend-streak">${friend.streak}-day streak</span><span class="friend-score">${friend.points}</span>${friend.isYou ? "" : `<button type="button" class="remove-friend" data-remove-friend="${escapeHTML(friend.id)}" aria-label="Remove ${escapeHTML(friend.name)}" title="Remove friend"><i data-lucide="x" aria-hidden="true"></i></button>`}</div>`).join("");
  [[".first-place", friends[0]], [".second-place", friends[1]], [".third-place", friends[2]]].forEach(([selector, friend]) => {
    const place = $(selector);
    if (!friend) {
      place.hidden = true;
      return;
    }
    place.hidden = false;
    const avatar = $(".podium-avatar", place);
    avatar.className = `podium-avatar avatar-${friend.color}`;
    avatar.textContent = friend.initials;
    $(".podium-name", place).textContent = friend.isYou ? "You" : friend.name.split(" ")[0];
    $("strong", place).textContent = friend.points;
  });
  $("#friend-count").textContent = `${friends.length} ${friends.length === 1 ? "person" : "people"}`;
  refreshIcons();
}

function renderSettings() {
  $("#bank-list").innerHTML = state.accounts.map((account) => `<div class="bank-row"><span class="bank-icon"><i data-lucide="landmark" aria-hidden="true"></i></span><span class="bank-info"><strong>${escapeHTML(account.institution)}</strong><span>${escapeHTML(account.detail)}</span></span><span class="bank-balance">${account.balance < 0 ? "−" : ""}${money(account.balance)}</span></div>`).join("");
  $("#account-count").textContent = `${state.accounts.length} ${state.accounts.length === 1 ? "account" : "accounts"}`;
  $("#monthly-budget").value = state.budget || "";
  $("#monthly-income").value = state.income || "";
  $("#sync-toggle").checked = state.preferences.sync;
  $("#reminder-toggle").checked = state.preferences.reminders;
  $("#leaderboard-toggle").checked = state.preferences.leaderboard;
  $(".profile-row > div strong").textContent = state.profile.name;
  $(".profile-row > div > span").textContent = state.profile.email;
  $(".profile-button .profile-initials").textContent = state.profile.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  $(".large-initials").textContent = $(".profile-button .profile-initials").textContent;
  refreshIcons();
}

function renderAll() {
  renderDashboard();
  renderSummary();
  renderLeaderboard();
  renderSettings();
}

function openCategoryDetails(categoryId) {
  const category = state.categories.find((item) => item.id === categoryId);
  if (!category) return;
  const rows = transactions[categoryId] || [["Recent purchase", money(category.amount)]];
  const detailRows = rows.map(([name, amount]) => `<div class="transaction-row"><span>${escapeHTML(name)}<small>Oct 1 · Linked account</small></span><span>${escapeHTML(amount)}</span></div>`).join("");
  const chartTotal = state.categories.filter((item) => item.visible).reduce((total, item) => total + Number(item.amount || 0), 0);
  const share = chartTotal ? category.amount / chartTotal * 100 : 0;
  const limit = Number(category.limit) || 0;
  const used = limit ? Math.min(100, category.amount / limit * 100) : 0;
  const isClose = limit > 0 && used >= 90;
  const status = limit ? (used >= 100 ? "Category limit reached" : isClose ? "Close to category limit" : "Within category budget") : "No category limit set";
  const average = rows.length ? category.amount / rows.length : category.amount;
  $("#dialog-content").innerHTML = `<p class="eyebrow">OCTOBER SPENDING</p><h2 class="dialog-title">${escapeHTML(category.name)}</h2><p class="dialog-subtitle">Category spending details</p><section class="category-detail-summary" aria-label="${escapeHTML(category.name)} spending summary"><p>Spent in October</p><strong class="category-detail-amount">${money(category.amount)}</strong><span class="category-detail-limit">${limit ? `of ${money(limit)} monthly limit` : "No monthly limit"}</span><div class="category-detail-track"><span style="width:${used}%;background:${category.color}"></span></div><div class="category-detail-status${isClose ? " is-close" : ""}"><i data-lucide="${isClose ? "triangle-alert" : "circle-check"}" aria-hidden="true"></i><span>${status}</span></div><div class="category-detail-stats"><div><span>Share</span><strong>${share.toFixed(1)}%</strong></div><div><span>Purchases</span><strong>${rows.length}</strong></div><div><span>Average</span><strong>${money(average)}</strong></div></div></section><section class="category-detail-transactions"><h3>Transactions</h3>${detailRows}</section>`;
  $("#detail-dialog").showModal();
  refreshIcons();
}

function previewDonutCategory(category) {
  if (!category) return resetDonutPreview();
  const visibleTotal = state.categories.filter((item) => item.visible).reduce((total, item) => total + Number(item.amount || 0), 0);
  const share = visibleTotal ? Math.round(category.amount / visibleTotal * 100) : 0;
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
  chart.setAttribute("aria-label", `${category.name}: ${money(category.amount)}, ${share}% of visible summary spending. Press Enter for details.`);
  $("#donut-center-label").textContent = category.name;
  $("#donut-total").textContent = money(category.amount);
  $("#donut-center-subtitle").textContent = `${share}% of spending`;
}

function resetDonutPreview() {
  const chart = $("#donut-chart");
  const total = state.categories.filter((category) => category.visible).reduce((sum, category) => sum + Number(category.amount || 0), 0);
  chart.classList.remove("is-previewing");
  delete chart.dataset.previewCategory;
  $$(".donut-slice.is-active, .donut-slice.is-muted, .legend-row.is-active, .legend-row.is-muted, .top-category-name.is-active, .top-category-name.is-muted").forEach((element) => element.classList.remove("is-active", "is-muted"));
  chart.setAttribute("aria-label", `Interactive chart. Focus and use arrow keys to preview a category; press Enter for details. Monthly spending of ${money(total)}. ${state.categories.filter((category) => category.visible).map((category) => `${category.name}, ${money(category.amount)}`).join(". ")}`);
  $("#donut-center-label").textContent = "THIS MONTH";
  $("#donut-total").textContent = money(total);
  $("#donut-center-subtitle").textContent = "across categories";
}

function categoryAtDonutPoint(event) {
  const chart = $("#donut-chart");
  const rect = chart.getBoundingClientRect();
  const radius = Math.min(rect.width, rect.height) / 2;
  const deltaX = event.clientX - (rect.left + rect.width / 2);
  const deltaY = event.clientY - (rect.top + rect.height / 2);
  if (Math.hypot(deltaX, deltaY) < radius * 0.64) return null;
  const angle = (Math.atan2(deltaY, deltaX) * 180 / Math.PI + 90 + 360) % 360;
  const visible = state.categories.filter((category) => category.visible && Number(category.amount) > 0);
  const total = visible.reduce((sum, category) => sum + Number(category.amount), 0);
  const position = angle / 360 * total;
  let accumulated = 0;
  return visible.find((category) => {
    accumulated += Number(category.amount);
    return position < accumulated;
  }) || visible.at(-1) || null;
}

function openSummaryEditor() {
  const categoryRows = state.categories.map((category) => `<div class="edit-row category-edit-row"><input class="category-visible" type="checkbox" data-category-id="${category.id}" aria-label="Show ${escapeHTML(category.name)} in summary" ${category.visible ? "checked" : ""}><input class="category-name" data-category-id="${category.id}" aria-label="Category name" maxlength="24" value="${escapeHTML(category.name)}"></div>`).join("");
  const goalRows = state.goals.map((goal) => `<div class="edit-row goal-edit-row" data-goal-row="${escapeHTML(goal.id)}"><select class="goal-kind-input" aria-label="Goal type"><option ${goal.kind === "Savings" ? "selected" : ""}>Savings</option><option ${goal.kind === "Spending" ? "selected" : ""}>Spending</option><option ${goal.kind === "Earnings" ? "selected" : ""}>Earnings</option><option ${goal.kind === "Investing" ? "selected" : ""}>Investing</option></select><input class="goal-name-input" aria-label="Goal name" maxlength="36" value="${escapeHTML(goal.name)}"><input class="goal-target-input" aria-label="Goal amount" type="number" min="1" step="1" value="${Number(goal.target)}"><button type="button" class="remove-goal" data-remove-goal="${escapeHTML(goal.id)}" aria-label="Remove ${escapeHTML(goal.name)}"><i data-lucide="x" aria-hidden="true"></i></button></div>`).join("");
  $("#dialog-content").innerHTML = `<p class="eyebrow">MAKE IT YOURS</p><h2 class="dialog-title">Edit your summary</h2><p class="dialog-subtitle">Choose which categories appear and keep your goals up to date.</p><form id="summary-edit-form" class="edit-form"><h3>SUMMARY CATEGORIES</h3>${categoryRows}<h3>GOALS</h3><div id="goal-editor-rows">${goalRows}</div><button class="add-goal-button" type="button" id="add-goal-row"><i data-lucide="plus" aria-hidden="true"></i> Add a goal</button><p class="dialog-form-feedback" id="edit-feedback" aria-live="polite"></p><button class="primary-button" type="submit">Save changes</button></form>`;
  $("#detail-dialog").showModal();
  refreshIcons();
}

function addGoalEditorRow() {
  const id = `goal-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  $("#goal-editor-rows").insertAdjacentHTML("beforeend", `<div class="edit-row goal-edit-row" data-goal-row="${id}"><select class="goal-kind-input" aria-label="Goal type"><option>Savings</option><option>Spending</option><option>Earnings</option><option>Investing</option></select><input class="goal-name-input" aria-label="Goal name" maxlength="36" placeholder="Give your goal a name"><input class="goal-target-input" aria-label="Goal amount" type="number" min="1" step="1" placeholder="400"><button type="button" class="remove-goal" data-remove-goal="${id}" aria-label="Remove new goal"><i data-lucide="x" aria-hidden="true"></i></button></div>`);
  refreshIcons();
}

function saveSummaryEditor(event) {
  event.preventDefault();
  const feedback = $("#edit-feedback");
  const goalRows = $$(".goal-edit-row", event.currentTarget);
  const goals = [];
  for (const row of goalRows) {
    const name = $(".goal-name-input", row).value.trim();
    const target = Number($(".goal-target-input", row).value);
    const kind = $(".goal-kind-input", row).value;
    if (!name || !target || target > state.income) {
      feedback.textContent = target > state.income ? "Set each goal below your monthly income." : "Add a name and amount to every goal, or remove the empty row.";
      return;
    }
    const oldGoal = state.goals.find((goal) => goal.id === row.dataset.goalRow);
    goals.push({ id: oldGoal?.id || row.dataset.goalRow, kind, name, target, progress: oldGoal?.progress || 0 });
  }
  state.categories.forEach((category) => {
    const nameInput = $(`.category-name[data-category-id="${category.id}"]`, event.currentTarget);
    const visibleInput = $(`.category-visible[data-category-id="${category.id}"]`, event.currentTarget);
    category.name = nameInput.value.trim() || category.name;
    category.visible = visibleInput.checked;
  });
  state.goals = goals;
  saveState();
  $("#detail-dialog").close();
  renderAll();
  showToast("Your summary and goals are updated.");
}

function sendMessage(message) {
  const cleanMessage = message.trim();
  if (!cleanMessage) return;
  const list = $("#message-list");
  const timestamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  list.insertAdjacentHTML("beforeend", `<div class="message-row user-row"><div class="message-bubble"><p>${escapeHTML(cleanMessage)}</p><time>${timestamp}</time></div></div><div class="message-row assistant-row"><img class="money-avatar brand-avatar" src="assets/money-man-mascot.png" alt=""><div class="message-bubble assistant-bubble"><strong>Mr. Moneyman</strong><p>${escapeHTML(makeChatReply(cleanMessage))}</p><time>${timestamp}</time></div></div>`);
  $("#message-list").lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
  $("#chat-input").value = "";
}

function makeChatReply(message) {
  const question = message.toLowerCase();
  if (question.includes("food") || question.includes("eating out")) {
    const food = state.categories.find((category) => category.id === "food");
    if (!food) return "Your categories are editable, so check Details for the latest breakdown and set a food category there.";
    const difference = (Number(food.limit) || 0) - Number(food.amount || 0);
    if (!food.limit) return `You've spent ${money(food.amount)} on food so far. Set a food category limit in your budget to make a plan for the rest of the month.`;
    return difference >= 0
      ? `Food is at ${money(food.amount)} of its ${money(food.limit)} category limit. That leaves ${money(difference)}. Planning a few meals before your next grocery trip could help.`
      : `Food is at ${money(food.amount)} against a ${money(food.limit)} category limit, so it is ${money(difference)} over. You could pause extra food purchases or adjust your plan for the rest of the month.`;
  }
  if (question.includes("savings goal") || question.includes("on track")) {
    const goal = state.goals.find((item) => item.kind === "Savings");
    if (!goal) return "You don't have a savings goal set yet. Add one from Details, then you can track your progress here.";
    const remaining = Math.max(0, goal.target - goal.progress);
    const percent = goal.target ? Math.min(100, Math.round(goal.progress / goal.target * 100)) : 0;
    return `You're ${percent}% of the way to ${goal.name}: ${money(goal.progress)} of ${money(goal.target)}. ${remaining ? `${money(remaining)} to go this month.` : "You've reached your goal this month. Nice work."}`;
  }
  if (question.includes("90%") || question.includes("budget")) {
    const budget = Number(state.budget) || 0;
    if (!budget) return "Set a monthly budget in Settings and I can calculate the 90% reminder point for you.";
    const reminderPoint = Math.round(budget * .9);
    const spent = totalSpent();
    const distance = Math.abs(reminderPoint - spent);
    return `90% of your ${money(budget)} monthly budget is ${money(reminderPoint)}. You've spent ${money(spent)} so far, ${money(distance)} ${spent >= reminderPoint ? "past" : "before"} that point.`;
  }
  return "I can help you check your food spending, savings goal, or monthly budget. Try one of the suggested questions to see those details.";
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) showPage(viewButton.dataset.view);

  const categoryButton = event.target.closest("[data-category-id]");
  if (categoryButton && !categoryButton.classList.contains("category-visible") && !categoryButton.classList.contains("category-name")) openCategoryDetails(categoryButton.dataset.categoryId);

  const removeGoal = event.target.closest("[data-remove-goal]");
  if (removeGoal) removeGoal.closest(".goal-edit-row").remove();

  const removeFriend = event.target.closest("[data-remove-friend]");
  if (removeFriend) {
    state.friends = state.friends.filter((friend) => friend.id !== removeFriend.dataset.removeFriend);
    saveState();
    renderLeaderboard();
  }
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
  if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Enter", "Escape"].includes(event.key)) return;
  event.preventDefault();
  const categories = state.categories.filter((category) => category.visible);
  if (event.key === "Escape") return resetDonutPreview();
  if (event.key === "Enter") {
    const selected = categories.find((category) => category.id === donutChart.dataset.previewCategory);
    if (selected) openCategoryDetails(selected.id);
    return;
  }
  const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
  const selectedIndex = categories.findIndex((category) => category.id === donutChart.dataset.previewCategory);
  const nextIndex = (selectedIndex + direction + categories.length) % categories.length;
  previewDonutCategory(categories[nextIndex]);
});
document.addEventListener("pointerover", (event) => {
  const row = event.target.closest(".legend-row, .top-category-name");
  if (row) previewDonutCategory(state.categories.find((category) => category.id === row.dataset.categoryId));
});
document.addEventListener("pointerout", (event) => {
  const row = event.target.closest(".legend-row, .top-category-name");
  if (row && !row.contains(event.relatedTarget)) resetDonutPreview();
});
document.addEventListener("focusin", (event) => {
  const row = event.target.closest(".legend-row, .top-category-name");
  if (row) previewDonutCategory(state.categories.find((category) => category.id === row.dataset.categoryId));
});
document.addEventListener("focusout", (event) => {
  const row = event.target.closest(".legend-row, .top-category-name");
  if (row && !row.contains(event.relatedTarget)) resetDonutPreview();
});

$("#trend-mode").addEventListener("change", (event) => renderTrend(event.target.value));
$("#edit-summary").addEventListener("click", openSummaryEditor);
$("#edit-goals-link").addEventListener("click", openSummaryEditor);
$("#detail-dialog .dialog-close").addEventListener("click", () => $("#detail-dialog").close());
$("#detail-dialog").addEventListener("click", (event) => {
  if (event.target === $("#detail-dialog")) $("#detail-dialog").close();
});
$("#detail-dialog").addEventListener("submit", (event) => {
  if (event.target.id === "summary-edit-form") saveSummaryEditor(event);
  if (event.target.id === "profile-edit-form") {
    event.preventDefault();
    state.profile.name = $("#profile-name").value.trim() || state.profile.name;
    state.profile.email = $("#profile-email").value.trim() || state.profile.email;
    saveState();
    $("#detail-dialog").close();
    renderSettings();
    showToast("Your account details are saved.");
  }
});
$("#detail-dialog").addEventListener("click", (event) => {
  if (event.target.closest("#add-goal-row")) addGoalEditorRow();
});

$("#suggestion-toggle").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  $("#suggestions").hidden = expanded;
});
$("#suggestions").addEventListener("click", (event) => {
  const suggestion = event.target.closest("button");
  if (!suggestion) return;
  $("#chat-input").value = suggestion.textContent;
  $("#chat-form").requestSubmit();
});
$("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage($("#chat-input").value);
});

$("#copy-code").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.friendCode);
    showToast("Your friend code is copied.");
  } catch {
    showToast(`Your friend code is ${state.friendCode}.`);
  }
});
$("#focus-invite").addEventListener("click", () => $("#invite-section").scrollIntoView({ behavior: "smooth", block: "center" }));
$("#add-friend-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#friend-code-input");
  const code = input.value.trim().toUpperCase();
  const feedback = $("#friend-feedback");
  if (!code || code === state.friendCode || state.friends.some((friend) => friend.code === code)) {
    feedback.textContent = "Enter a different, unused friend code.";
    return;
  }
  state.friends.push({ id: `friend-${Date.now()}`, code, name: "New friend", initials: "NF", points: 600, streak: 1, color: "sage" });
  saveState();
  renderLeaderboard();
  input.value = "";
  feedback.textContent = "Friend added to your circle.";
});

function checkCategoryWarnings() {
  if (!state.preferences.reminders) return;
  const nearLimit = state.categories.find((category) => category.limit && category.amount / category.limit >= 0.9);
  if (nearLimit) showToast(`${nearLimit.name} is at ${Math.round(nearLimit.amount / nearLimit.limit * 100)}% of its category budget.`);
}

function updateCategoryBudgets(totalBudget) {
  const categories = state.categories.filter((category) => Number(category.limit) > 0);
  const currentTotal = categories.reduce((total, category) => total + Number(category.limit), 0);
  if (!currentTotal || !categories.length) return;
  let allocated = 0;
  categories.forEach((category, index) => {
    const limit = index === categories.length - 1
      ? totalBudget - allocated
      : Math.round(totalBudget * Number(category.limit) / currentTotal);
    category.limit = Math.max(0, limit);
    allocated += category.limit;
  });
}

$("#budget-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const budgetValue = $("#monthly-budget").value;
  const income = Number($("#monthly-income").value);
  const budget = budgetValue ? Number(budgetValue) : null;
  const feedback = $("#budget-feedback");
  if (budget && budget > income) {
    feedback.textContent = "Your budget should fit within your monthly income. Adjust either amount to continue.";
    return;
  }
  if (budget) updateCategoryBudgets(budget);
  state.budget = budget;
  state.income = income;
  saveState();
  feedback.textContent = budget ? "Budget saved." : "Budget cleared. Your dashboard will show NO BUDGET.";
  renderAll();
  checkCategoryWarnings();
});

$("#connect-bank").addEventListener("click", () => {
  const button = $("#connect-bank");
  button.dataset.attempts = String(Number(button.dataset.attempts || 0) + 1);
  const attempts = Number(button.dataset.attempts);
  const feedback = $("#link-feedback");
  if (attempts < 3) {
    feedback.textContent = `This demo can't connect to a bank. Please try again (${attempts} of 3).`;
  } else {
    feedback.textContent = "Still having trouble? Add your budget manually for now.";
    $("#manual-entry").hidden = false;
    $("#manual-budget").focus();
  }
});
$("#manual-entry").addEventListener("submit", (event) => {
  event.preventDefault();
  state.budget = Number($("#manual-budget").value);
  saveState();
  renderAll();
  $("#link-feedback").textContent = "Your budget is saved. You can connect your account later in Settings.";
  $("#manual-entry").hidden = true;
});

const preferenceControls = {
  "#sync-toggle": "sync",
  "#reminder-toggle": "reminders",
  "#leaderboard-toggle": "leaderboard"
};
Object.entries(preferenceControls).forEach(([selector, key]) => {
  $(selector).addEventListener("change", (event) => {
    state.preferences[key] = event.target.checked;
    saveState();
    if (key === "leaderboard") showToast(event.target.checked ? "Your progress is visible to friends." : "Your leaderboard progress is hidden.");
  });
});

$("#edit-profile").addEventListener("click", () => {
  $("#dialog-content").innerHTML = `<p class="eyebrow">YOUR ACCOUNT</p><h2 class="dialog-title">Edit account details</h2><p class="dialog-subtitle">Update the name shown in your friend circle.</p><form id="profile-edit-form" class="profile-edit-form"><label for="profile-name">Name</label><input id="profile-name" maxlength="50" value="${escapeHTML(state.profile.name)}" required><label for="profile-email">Email</label><input id="profile-email" type="email" value="${escapeHTML(state.profile.email)}" required><button class="primary-button" type="submit">Save details</button></form>`;
  $("#detail-dialog").showModal();
});
$("#privacy-link").addEventListener("click", () => {
  $("#dialog-content").innerHTML = `<p class="eyebrow">YOUR ACCOUNT</p><h2 class="dialog-title">Privacy & data</h2><p class="dialog-subtitle">This prototype stores your sample budget, categories, goals, and friend list in this browser only. No bank connection or data sharing service is active.</p>`;
  $("#detail-dialog").showModal();
});
$("#help-link").addEventListener("click", () => {
  $("#dialog-content").innerHTML = `<p class="eyebrow">HERE TO HELP</p><h2 class="dialog-title">Help & support</h2><p class="dialog-subtitle">For this prototype, bank connections and support messaging are simulated. Your budgets and goals can be changed in Settings or from Edit on the Details page.</p>`;
  $("#detail-dialog").showModal();
});

renderAll();