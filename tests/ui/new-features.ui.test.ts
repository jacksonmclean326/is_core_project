// Savings record on Home, category limits saved to the account, and budgets carried forward to a new month.
// @ts-nocheck
import assert from "node:assert/strict";
import { test } from "node:test";
import { describeViolations, openPage } from "./harness.ts";

const record = (overrides = {}) => [200, {
  hasGoals: true,
  needed: 3,
  window: 4,
  months: [
    { month: "2026-07", met: true, goalsMet: 2, goalsCounted: 2 },
    { month: "2026-08", met: true, goalsMet: 2, goalsCounted: 2 },
    { month: "2026-09", met: false, goalsMet: 1, goalsCounted: 2 },
    { month: "2026-10", met: true, goalsMet: 2, goalsCounted: 2 },
  ],
  tracked: 4,
  met: 3,
  consistent: true,
  ...overrides,
}];

test("Home shows the user's savings record for the last four months", async () => {
  const page = await openPage("home", { routes: { "/api/savings-record": () => record() } });
  assert.equal(page.$("#savings-record").hidden, false);
  assert.equal(page.$("#record-title").textContent, "Met your goals 3 of the last 4 months");
  assert.deepEqual(page.$$(".record-month").map((item) => item.textContent), ["JulMet", "AugMet", "SepMissed", "OctMet"]);
  assert.match(page.$("#record-note").textContent, /consistent saving/);
  assert.match(page.$$(".record-month")[2].getAttribute("aria-label"), /September: Missed, 1 of 2 goals met/);
  assert.deepEqual(describeViolations(await page.axe(page.$("#savings-record"))), []);
});

test("the savings record explains what to do when there is nothing to show yet", async () => {
  const empty = { month: "2026-10", met: null, goalsMet: 0, goalsCounted: 0 };
  let page = await openPage("home", { routes: { "/api/savings-record": () => record({ hasGoals: false, tracked: 0, met: 0, consistent: false, months: [empty, empty, empty, empty] }) } });
  assert.equal(page.$("#record-title").textContent, "Start your savings record");
  assert.match(page.$("#record-note").textContent, /Add a Savings or Spending goal/);

  page = await openPage("home", { routes: { "/api/savings-record": () => record({ tracked: 2, met: 1, consistent: false }) } });
  assert.equal(page.$("#record-title").textContent, "Met your goals 1 of the last 2 months");
  assert.match(page.$("#record-note").textContent, /3 of the last 4 months to be a consistent saver/);

  page = await openPage("home", { routes: { "/api/savings-record": () => [503, { error: "not set up" }] } });
  assert.equal(page.$("#savings-record").hidden, true, "the card stays out of the way if the server can't provide it");
});

const accountWith = (limits) => () => [200, {
  id: "u1", email: "demo@example.com", user_metadata: null, daily_sync: true, budget_reminders: true, leaderboard_visibility: true, streak: 1, category_limits: limits,
}];
const savedLimits = (page) => Object.fromEntries(JSON.parse(page.window.localStorage.getItem("money-man-prototype")).categories.map((c) => [c.id, c.limit]));

test("category limits saved on the account replace this browser's copy", async () => {
  const page = await openPage("details", { routes: { "/api/account": accountWith({ food: 123, housing: 1500 }) } });
  await page.flush(800);
  assert.equal(savedLimits(page).food, 123);
  assert.equal(savedLimits(page).housing, 1500);
  // A category the account didn't know about yet (the custom one) may be added, but the account's values are kept.
  for (const call of page.calls.filter((item) => item.path === "/api/account/category-limits")) {
    assert.equal(call.body.limits.food, 123);
    assert.equal(call.body.limits.housing, 1500);
  }
});

test("when the account already has every category's limit, loading a page saves nothing", async () => {
  const all = { housing: 900, food: 123, transport: 180, utilities: 160, education: 140, personal: 250, other: 350, "c-1a2b3c4d": 0 };
  const page = await openPage("details", { routes: { "/api/account": accountWith(all) } });
  await page.flush(800);
  assert.equal(page.calls.some((call) => call.path === "/api/account/category-limits"), false);
});

test("an account without saved limits takes this browser's limits, and later changes are saved to the account", async () => {
  const page = await openPage("details", { routes: { "/api/account": accountWith(null) } });
  await page.flush(800);
  const first = page.calls.filter((call) => call.path === "/api/account/category-limits" && call.method === "PUT");
  assert.equal(first.length, 1);
  assert.equal(first[0].body.limits.food, 300, "the browser's existing food limit moves to the account");
});

test("Settings says when this month's budget was carried over from last month", async () => {
  const page = await openPage("settings", {
    routes: {
      "/api/budget": () => [200, { budget: { budgetId: "b1", monthlyBudget: 2000, monthlyIncome: 2500, month: "2026-10-01", carriedFrom: "2026-10" } }],
    },
  });
  assert.equal(page.$("#monthly-income").value, "2500");
  assert.match(page.$("#budget-feedback").textContent, /Carried over from October\. Change it and press Save to set a new amount for/);
});
