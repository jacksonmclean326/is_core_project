// Home graph editor behavior against the real page code in jsdom.
// @ts-nocheck
import assert from "node:assert/strict";
import { test } from "node:test";
import { openPage } from "./harness.ts";

test("Edit Graph changes the metric and chart style and persists the choice", async () => {
  const page = await openPage("home");
  await page.click("#edit-graph");
  assert.equal(page.$("#graph-dialog").open, true);
  await page.choose("#graph-metric", "category-spending");
  const bars = page.$('input[name="graph-type"][value="bar"]');
  bars.checked = true;
  bars.dispatchEvent(new page.window.Event("change", { bubbles: true }));
  await page.submit("#graph-form");

  assert.equal(page.$("#graph-dialog").open, false);
  assert.equal(page.$("#trend-title").textContent, "Total spending by category");
  assert.ok(page.$("#trend-chart rect.chart-bar"));
  assert.deepEqual(
    JSON.parse(page.window.localStorage.getItem("money-man-home-graph")),
    { metric: "category-spending", type: "bar" },
  );
});

test("goal graph explains when no goals are available", async () => {
  const page = await openPage("home");
  await page.click("#edit-graph");
  await page.choose("#graph-metric", "goal-remaining");
  await page.submit("#graph-form");

  assert.equal(page.$("#trend-title").textContent, "Amount left in goals");
  assert.match(page.$("#trend-chart").textContent, /Add a savings goal on Details/);
});

test("the friends graph uses real leaderboard points, not sample data", async () => {
  const entry = (id, name, isYou, score) => ({ id, name, isYou, score, goalCount: 1, completed: 0, spendingCount: 0, withinLimit: 0 });
  const page = await openPage("home", {
    routes: {
      "/api/leaderboard": () => [200, { entries: [entry("f1", "Ana Saver", false, 800), entry("u1", "Demo User", true, 500), entry("f2", "No Goals", false, null)], visible: true, updatedAt: "2026-11-14T12:00:00Z" }],
    },
  });
  await page.click("#edit-graph");
  assert.equal(page.$$(".graph-type-preview").length, 3);
  assert.equal(page.$('input[value="donut"] + .graph-type-card-content').textContent.includes("See proportions"), true);
  assert.doesNotMatch(page.$("#graph-metric").textContent, /sample/i);
  await page.choose("#graph-metric", "friend-points");
  const donut = page.$('input[name="graph-type"][value="donut"]');
  donut.checked = true;
  donut.dispatchEvent(new page.window.Event("change", { bubbles: true }));
  await page.submit("#graph-form");
  await page.flush(120);

  assert.equal(page.$("#trend-title").textContent, "Friends' goal points");
  assert.equal(page.$("#trend-value").textContent, "500 pts");
  assert.ok(page.$("#trend-chart svg[viewBox='0 0 280 220']"));
  assert.equal(page.$$("#trend-chart circle.chart-donut-ring").length, 2, "unranked friends are left out");
  assert.match(page.$("#chart-legend").textContent, /Ana Saver.*800 pts/s);
  assert.match(page.$("#chart-legend").textContent, /You.*500 pts/s);
  assert.match(page.$("#chart-note").textContent, /Friends leaderboard/);
  assert.doesNotMatch(page.$("main").textContent, /sample demo data/);
});

test("bar graphs use value labels and a distinct current value", async () => {
  const page = await openPage("home");
  await page.click("#edit-graph");
  await page.choose("#graph-metric", "category-spending");
  const bars = page.$('input[name="graph-type"][value="bar"]');
  bars.checked = true;
  bars.dispatchEvent(new page.window.Event("change", { bubbles: true }));
  await page.submit("#graph-form");

  assert.ok(page.$("#trend-chart rect.chart-bar-track"));
  assert.ok(page.$("#trend-chart text.chart-value"));
});