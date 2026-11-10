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

test("donut graphs show a value legend and explain sample friend streak data", async () => {
  const page = await openPage("home");
  await page.click("#edit-graph");
  assert.equal(page.$$(".graph-type-preview").length, 3);
  assert.equal(page.$('input[value="donut"] + .graph-type-card-content').textContent.includes("See proportions"), true);
  await page.choose("#graph-metric", "friend-streaks");
  const donut = page.$('input[name="graph-type"][value="donut"]');
  donut.checked = true;
  donut.dispatchEvent(new page.window.Event("change", { bubbles: true }));
  await page.submit("#graph-form");

  assert.ok(page.$("#trend-chart svg[viewBox='0 0 280 220']"));
  assert.ok(page.$("#trend-chart circle.chart-donut-ring"));
  assert.equal(page.$("#chart-legend").hidden, false);
  assert.match(page.$("#chart-note").textContent, /sample demo data/);
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