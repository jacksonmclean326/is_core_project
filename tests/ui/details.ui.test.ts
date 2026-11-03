// Behaviour and accessibility of the Details page, run in a simulated DOM against a fake API (no browser).
// @ts-nocheck
import assert from "node:assert/strict";
import { test } from "node:test";
import { addMonths, currentMonthKey } from "../../src/shared/months.ts";
import { describeViolations, openPage, sampleTransactions } from "./harness.ts";

const thisMonth = currentMonthKey(new Date());
const text = (element) => element.textContent.replace(/\s+/g, " ").trim();
const manualCreated = { id: "m2", name: "Pizza", amount: 12.5, date: `${thisMonth}-20`, category: "food", account: "Manual entry", institution: "Manual", manual: true };

const lots = Array.from({ length: 250 }, (_, i) => ({
  id: `b${i}`, name: `Merchant ${i}`, amount: 5 + (i % 7), date: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}`,
  category: "food", account: "Checking", institution: "Bank",
}));

test("the page lists every transaction with real headings, and shows hostile names as plain text", async () => {
  const page = await openPage("details");
  assert.equal(page.$$(".tx-row").length, 6);
  assert.ok(page.$$("h3.tx-day").length >= 3, "each day has a real heading");
  assert.match(text(page.$("#tx-summary")), /^6 transactions · \$1,256$/);
  assert.equal(page.$("#tx-list img"), null, "a merchant called <img ...> must not become an image");
  assert.match(page.$("#tx-list").textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(page.$("#tx-controls").hidden, false);
});

test("the see every transaction link resolves to the Details route despite the base URL", async () => {
  const page = await openPage("details");
  const target = new URL(page.$(".view-all-link").getAttribute("href"), page.window.document.baseURI);
  assert.equal(target.pathname, "/details");
  assert.equal(target.hash, "#all-transactions");
});

test("search, category filter and sort narrow and reorder the list", async () => {
  const page = await openPage("details");
  await page.type("#tx-search", "starbucks");
  assert.equal(page.$$(".tx-row").length, 1);
  assert.match(text(page.$("#tx-summary")), /^1 of 6 transactions/);
  await page.type("#tx-search", "");
  await page.choose("#tx-category-filter", "food");
  assert.equal(page.$$(".tx-row").length, 2);
  await page.choose("#tx-category-filter", "");
  await page.choose("#tx-sort", "largest");
  assert.match(text(page.$$(".tx-row")[0]), /Corner Bakery/);
  assert.equal(page.$$("h3.tx-day").length, 0, "size sorts are not split into days");
  await page.type("#tx-search", "zzzz");
  assert.match(text(page.$("#tx-list")), /Nothing matches that search/);
});

test("a big month shows 100 rows at a time", async () => {
  const page = await openPage("details", { transactions: lots });
  assert.equal(page.$$(".tx-row").length, 100);
  assert.equal(page.$("#tx-more").hidden, false);
  await page.click("#tx-more");
  assert.equal(page.$$(".tx-row").length, 200);
  await page.click("#tx-more");
  assert.equal(page.$$(".tx-row").length, 250);
  assert.equal(page.$("#tx-more").hidden, true);
});

test("the month arrows load that month and update the label and address", async () => {
  const page = await openPage("details");
  assert.equal(page.$("#month-next").disabled, true, "cannot go past the current month");
  page.newCalls();
  await page.click("#month-prev");
  const previous = addMonths(thisMonth, -1);
  assert.ok(page.calls.some((call) => call.path === `/api/transactions?month=${previous}`), "asked for the previous month");
  assert.equal(page.window.location.search, `?month=${previous}`);
  assert.equal(page.$("#month-next").disabled, false);
  await page.click("#month-next");
  assert.equal(page.window.location.search, "", "back on the current month the address is clean");
});

test("Add: bad input is explained, good input is sent exactly as typed", async () => {
  const page = await openPage("details", { routes: { "/api/transactions/manual": () => [201, { transaction: manualCreated }] } });
  await page.click("#add-transaction");
  assert.ok(page.$("#detail-dialog").hasAttribute("open"));
  await page.submit("#transaction-form");
  assert.match(text(page.$("#tx-feedback")), /Enter a merchant/);
  assert.equal(page.$("#tx-feedback").getAttribute("role"), "alert", "errors are announced at once");
  await page.type("#tx-name", "Pizza");
  await page.type("#tx-amount", "-3");
  await page.submit("#transaction-form");
  assert.match(text(page.$("#tx-feedback")), /greater than \$0/);
  assert.equal(page.calls.filter((c) => c.method === "POST").length, 0, "nothing is sent while the form is invalid");
  await page.type("#tx-amount", "12.50");
  await page.type("#tx-date", `${thisMonth}-20`);
  await page.choose("#tx-category", "food");
  await page.submit("#transaction-form");
  const post = page.calls.find((c) => c.method === "POST");
  assert.deepEqual(post.body, { name: "Pizza", amount: 12.5, date: `${thisMonth}-20`, category: "food" });
  assert.equal(page.$("#detail-dialog").hasAttribute("open"), false, "the form closes after saving");
});

test("manual rows can be edited and deleted from the list; bank rows cannot", async () => {
  const page = await openPage("details", {
    routes: {
      "/api/transactions/manual/m1": (_path, init) => (init.method === "DELETE" ? [200, { ok: true }] : [200, { transaction: { ...manualCreated, id: "m1", name: "Corner Bakery 2" } }]),
    },
  });
  assert.equal(page.$$("[data-edit-manual]").length, 1);
  assert.equal(page.$$("[data-delete-manual]").length, 1);
  await page.click("[data-edit-manual]");
  assert.equal(page.$("#tx-name").value, "Corner Bakery");
  assert.equal(page.$("#tx-amount").value, "1200");
  await page.type("#tx-name", "Corner Bakery 2");
  await page.submit("#transaction-form");
  const patch = page.calls.find((c) => c.method === "PATCH");
  assert.equal(patch.path, "/api/transactions/manual/m1");
  assert.equal(patch.body.name, "Corner Bakery 2");
  await page.click("[data-delete-manual]");
  assert.ok(page.calls.some((c) => c.method === "DELETE" && c.path === "/api/transactions/manual/m1"));
});

test("moving a transaction from the list asks the server, merchant-wide by default", async () => {
  const page = await openPage("details", { routes: { "/api/transactions/category": () => [200, { moved: 1 }] } });
  const select = page.$('[data-transaction-id="p1"]');
  await page.choose('[data-transaction-id="p1"]', "transport");
  const put = page.calls.find((c) => c.method === "PUT");
  assert.deepEqual(put.body, { transactionId: "p1", category: "transport", applyToMerchant: true });
  // unticking the box changes the request
  await page.click("#tx-merchant-option input");
  assert.equal(page.$("#tx-merchant-option input").checked, false);
  page.newCalls();
  await page.choose('[data-transaction-id="p2"]', "food");
  assert.equal(page.calls.find((c) => c.method === "PUT").body.applyToMerchant, false);
  assert.ok(select);
});

test("category limits: set one from the popup, reject nonsense, and see it in Edit summary", async () => {
  const page = await openPage("details");
  await page.click(".legend-row:nth-child(2)"); // Food
  assert.match(text(page.$("#dialog-content")), /monthly limit/);
  await page.click("[data-edit-limit]");
  await page.type("#limit-input", "abc");
  await page.submit(".limit-form");
  assert.match(text(page.$("#limit-feedback")), /Enter a limit/);
  assert.equal(page.$("#limit-feedback").getAttribute("role"), "alert");
  assert.match(page.$("#limit-input").getAttribute("aria-describedby"), /limit-feedback/);
  await page.type("#limit-input", "$250");
  await page.submit(".limit-form");
  assert.match(text(page.$("#dialog-content")), /of \$250 monthly limit/);
  const saved = JSON.parse(page.window.localStorage.getItem("money-man-prototype"));
  assert.equal(saved.categories.find((c) => c.id === "food").limit, 250);

  page.closeDialog();
  await page.click("#edit-summary");
  const foodLimit = page.$$(".category-edit-row").find((row) => row.dataset.categoryRow === "food").querySelector(".category-limit");
  assert.equal(foodLimit.value, "250");
  assert.match(text(page.$("#limits-note")), /add up to/);

  await page.type(".category-edit-row[data-category-row='housing'] .category-limit", "99999");
  assert.match(text(page.$("#limits-note")), /That is over your budget/);
  assert.ok(page.$("#limits-note").classList.contains("is-over"));
  foodLimit.value = "nope";
  await page.submit("#summary-edit-form");
  assert.match(text(page.$("#edit-feedback")), /Enter a limit/);
});

test("every popup is named after its heading, and every control has a name", async () => {
  const page = await openPage("details");
  const opened = [];
  for (const [label, open] of [
    ["Add a transaction", () => page.click("#add-transaction")],
    ["Edit your summary", () => page.click("#edit-summary")],
    ["Food", () => page.click(".legend-row:nth-child(2)")],
  ]) {
    await open();
    const dialog = page.$("#detail-dialog");
    const title = page.window.document.getElementById(dialog.getAttribute("aria-labelledby"));
    assert.ok(title, `${label}: the popup points at its heading`);
    assert.equal(text(title), label);
    for (const control of page.$$("#dialog-content input, #dialog-content select, #dialog-content button")) {
      const named = control.getAttribute("aria-label") || control.getAttribute("aria-labelledby") || control.closest("label") || (control.id && page.$(`label[for="${control.id}"]`)) || text(control);
      assert.ok(named, `${label}: <${control.tagName.toLowerCase()} class="${control.className}"> has no accessible name`);
    }
    opened.push(label);
    page.closeDialog();
  }
  assert.equal(opened.length, 3);
});

test("category names in Edit summary are distinguishable for screen readers", async () => {
  const page = await openPage("details");
  await page.click("#edit-summary");
  const labels = page.$$(".category-name").map((input) => input.getAttribute("aria-label"));
  assert.equal(new Set(labels).size, labels.length, `labels are unique: ${labels.join(", ")}`);
  await page.click("#add-category-row");
  assert.ok(page.$$(".category-name").at(-1).getAttribute("aria-label").includes("new category"));
});

test("accessibility engine: no violations on the page or in any popup", async () => {
  const page = await openPage("details");
  const states = [
    ["page", async () => {}],
    ["category popup", async () => { await page.click(".legend-row:nth-child(2)"); }],
    ["limit form", async () => { await page.click("[data-edit-limit]"); }],
    ["add form", async () => { page.closeDialog(); await page.click("#add-transaction"); }],
    ["edit summary", async () => { page.closeDialog(); await page.click("#edit-summary"); }],
    ["edit summary with a new row", async () => { await page.click("#add-category-row"); }],
    ["filtered, sorted list", async () => { page.closeDialog(); await page.type("#tx-search", "a"); await page.choose("#tx-sort", "largest"); }],
  ];
  for (const [label, enter] of states) {
    await enter();
    const results = await page.axe();
    assert.deepEqual(describeViolations(results), [], `${label} has accessibility violations`);
  }
});

test("goals save through the API independently of category edits and preserve progress", async () => {
  const goal = { goal_id: "12345678-1234-1234-1234-123456789abc", goal_type: "Savings", goal_name: "Emergency fund", desired_savings: 1000, amount_savings: 250 };
  const page = await openPage("details", { routes: {
    "/api/goals": (_path, init, body) => [200, { goals: init.method === "PUT" ? [{ ...goal, goal_name: body.items[0].name }] : [goal] }],
  } });
  assert.match(text(page.$("#goal-card-list")), /Emergency fund/);
  await page.click("#edit-summary");
  assert.equal(page.$(".goal-edit-row"), null);
  assert.ok(page.$("#add-category-row"));
  page.closeDialog();
  await page.click("#edit-goals-link");
  await page.type(".goal-name-input", "Rainy day fund");
  await page.submit("#goals-edit-form");
  const save = page.calls.find((call) => call.path === "/api/goals" && call.method === "PUT");
  assert.deepEqual(save.body.items, [{ id: goal.goal_id, kind: "Savings", name: "Rainy day fund", target: 1000 }]);
  assert.match(text(page.$("#goal-card-list")), /Rainy day fund/);
  assert.match(text(page.$("#goal-card-list")), /\$250 toward goal/);
  assert.equal(page.$("#detail-dialog").open, false);
  page.dom.window.close();
});

test("failed goal saves keep the editor and input available for retry", async () => {
  const page = await openPage("details", { routes: {
    "/api/goals": (_path, init) => init.method === "PUT" ? [500, { error: "Save unavailable" }] : [200, { goals: [] }],
  } });
  await page.click("#edit-goals-link");
  await page.click("#add-goal-row");
  await page.type(".goal-name-input", "Vacation");
  await page.type(".goal-target-input", "500");
  await page.submit("#goals-edit-form");
  assert.equal(page.$("#detail-dialog").open, true);
  assert.equal(page.$(".goal-name-input").value, "Vacation");
  assert.match(text(page.$("#edit-feedback")), /Goals were not saved/);
  assert.equal(page.$('#goals-edit-form button[type="submit"]').disabled, false);
  page.dom.window.close();
});
