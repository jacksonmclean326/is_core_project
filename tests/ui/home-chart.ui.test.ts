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

test("the friends graph uses normalized monthly challenge scores, not sample data", async () => {
  const entry = (id, name, isYou, score, status = "on-track") => ({ id, name, isYou, score, status });
  const page = await openPage("home", {
    routes: {
      "/api/leaderboard": () => [200, {
        challenge: { id: "eating-out", title: "The Eating Out Challenge", description: "Restaurant and takeout purchases count.", month: "2026-11", daysRemaining: 17 },
        entries: [entry("f1", "Ana Saver", false, 80), entry("u1", "Demo User", true, 50), entry("f2", "No Goals", false, 0, "cap-reached")],
        visible: true,
        updatedAt: "2026-11-14T12:00:00Z",
      }],
    },
  });
  await page.click("#edit-graph");
  assert.equal(page.$$(".graph-type-preview").length, 3);
  assert.equal(page.$('input[value="donut"] + .graph-type-card-content').textContent.includes("category shares"), true);
  assert.doesNotMatch(page.$("#graph-metric").textContent, /sample/i);
  await page.choose("#graph-metric", "friend-points");
  assert.equal(page.$('input[name="graph-type"][value="bar"]').checked, true);
  assert.equal(page.$('input[name="graph-type"][value="donut"]').closest(".graph-type-card").hidden, true);
  await page.submit("#graph-form");
  await page.flush(120);

  assert.equal(page.$("#trend-title").textContent, "Friends' monthly challenge");
  assert.equal(page.$("#trend-value").textContent, "50%");
  assert.ok(page.$("#trend-chart rect.chart-bar"));
  assert.match(page.$("#trend-chart").textContent, /Ana Saver/);
  assert.match(page.$("#trend-chart").textContent, /You/);
  assert.match(page.$("#chart-note").textContent, /The Eating Out Challenge/);
  assert.doesNotMatch(`${page.$("#trend-value").textContent} ${page.$("#chart-legend").textContent} ${page.$("#chart-note").textContent}`, /\$\d/);
  assert.doesNotMatch(page.$("main").textContent, /sample demo data/);
});

test("chart styles adapt to the selected data and old mismatched choices fall back safely", async () => {
  const page = await openPage("home");
  await page.click("#edit-graph");
  const line = page.$('input[name="graph-type"][value="line"]');
  const donut = page.$('input[name="graph-type"][value="donut"]');
  const bar = page.$('input[name="graph-type"][value="bar"]');

  assert.equal(line.checked, true);
  assert.equal(donut.closest(".graph-type-card").hidden, true);
  await page.choose("#graph-metric", "category-spending");
  assert.equal(donut.checked, true, "category proportions default to a donut chart");
  assert.equal(line.closest(".graph-type-card").hidden, true);
  assert.match(page.$("#graph-metric-help").textContent, /category contributes/);

  await page.choose("#graph-metric", "goal-remaining");
  assert.equal(bar.checked, true, "goals are compared with bars");
  assert.equal(donut.closest(".graph-type-card").hidden, true);
  await page.submit("#graph-form");
  assert.deepEqual(
    JSON.parse(page.window.localStorage.getItem("money-man-home-graph")),
    { metric: "goal-remaining", type: "bar" },
  );
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