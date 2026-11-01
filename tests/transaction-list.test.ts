import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterTransactions,
  groupByDate,
  renderRows,
  sortLabels,
  sortTransactions,
  summarizeList,
  type ListTransaction,
} from "../src/shared/transaction-list.ts";

const tx = (id: string, name: string, amount: number, date: string, category = "food", extra: Partial<ListTransaction> = {}): ListTransaction => ({
  id, name, amount, date, category, account: "Checking", institution: "First Platypus Bank", ...extra,
});
const names: Record<string, string> = { food: "Food", transport: "Transport", other: "Other", "c-1a2b3c4d": "Fun Money" };
const categoryName = (key: string) => names[key] ?? key;

const sample = [
  tx("1", "Starbucks", 6.5, "2026-10-28"),
  tx("2", "Uber", 14, "2026-10-28", "transport"),
  tx("3", "Cafe Rio", 12.25, "2026-10-26"),
  tx("4", "Interest charged", 20, "2026-10-01", "other", { account: "Credit card" }),
  tx("5", "Corner Bakery", 1200, "2026-10-15", "c-1a2b3c4d", { manual: true, account: "Manual entry", institution: "Manual" }),
];

const ids = (list: ListTransaction[]) => list.map((item) => item.id).join(",");

test("no search shows everything", () => {
  assert.equal(filterTransactions(sample, { query: "", category: "" }, categoryName).length, 5);
  assert.equal(filterTransactions(sample, { query: "   ", category: "" }, categoryName).length, 5);
  assert.equal(filterTransactions([], { query: "x", category: "" }, categoryName).length, 0);
});

test("search matches merchant, account, bank, category and date, ignoring case", () => {
  const find = (query: string) => ids(filterTransactions(sample, { query, category: "" }, categoryName));
  assert.equal(find("starbucks"), "1");
  assert.equal(find("STARBUCKS"), "1");
  assert.equal(find("star"), "1");
  assert.equal(find("credit card"), "4"); // account
  assert.equal(find("platypus"), "1,2,3,4"); // bank name (the manual entry is not from the bank)
  assert.equal(find("transport"), "2"); // category name
  assert.equal(find("fun money"), "5"); // custom category name
  assert.equal(find("2026-10-26"), "3"); // date
  assert.equal(find("zzz"), "");
});

test("every word of the search must match (in any order)", () => {
  const find = (query: string) => ids(filterTransactions(sample, { query, category: "" }, categoryName));
  assert.equal(find("cafe rio"), "3");
  assert.equal(find("rio cafe"), "3");
  assert.equal(find("food checking"), "1,3");
  assert.equal(find("food credit"), ""); // food rows are on checking
});

test("amounts can be searched with or without $ and commas", () => {
  const find = (query: string) => ids(filterTransactions(sample, { query, category: "" }, categoryName));
  assert.equal(find("12.25"), "3");
  assert.equal(find("$12.25"), "3");
  assert.equal(find("1200"), "5");
  assert.equal(find("$1,200"), "5");
  assert.equal(find("6.50"), "1");
  assert.equal(find("14"), "2");
});

test("accents are ignored when searching", () => {
  const list = [tx("a", "Café Rio", 12, "2026-10-01"), tx("b", "Café Uno", 9, "2026-10-02")];
  assert.equal(ids(filterTransactions(list, { query: "cafe", category: "" }, categoryName)), "a,b");
  assert.equal(ids(filterTransactions(list, { query: "café", category: "" }, categoryName)), "a,b");
});

test("manual entries can be found by searching for 'manual'", () => {
  assert.equal(ids(filterTransactions(sample, { query: "manual", category: "" }, categoryName)), "5");
  assert.equal(ids(filterTransactions(sample, { query: "bank", category: "" }, categoryName)), "1,2,3,4");
});

test("the category filter keeps only that category, and combines with the search", () => {
  assert.equal(ids(filterTransactions(sample, { query: "", category: "food" }, categoryName)), "1,3");
  assert.equal(ids(filterTransactions(sample, { query: "", category: "c-1a2b3c4d" }, categoryName)), "5");
  assert.equal(ids(filterTransactions(sample, { query: "rio", category: "food" }, categoryName)), "3");
  assert.equal(ids(filterTransactions(sample, { query: "rio", category: "transport" }, categoryName)), "");
  assert.equal(ids(filterTransactions(sample, { query: "", category: "nope" }, categoryName)), "");
});

test("regular-expression characters in the search are just text", () => {
  const list = [tx("a", "Pizza (large) + salad", 9, "2026-10-01"), tx("b", "Plain", 5, "2026-10-02")];
  assert.equal(ids(filterTransactions(list, { query: "(large)", category: "" }, categoryName)), "a");
  assert.equal(ids(filterTransactions(list, { query: ".*", category: "" }, categoryName)), "");
  assert.equal(ids(filterTransactions(list, { query: "+", category: "" }, categoryName)), "a");
});

test("sorting: newest, oldest, largest and smallest, with steady tie-breaks", () => {
  assert.equal(ids(sortTransactions(sample, "newest")), "2,1,3,5,4"); // Oct 28 (14 before 6.5), 26, 15, 1
  assert.equal(ids(sortTransactions(sample, "oldest")), "4,5,3,2,1");
  assert.equal(ids(sortTransactions(sample, "largest")), "5,4,2,3,1");
  assert.equal(ids(sortTransactions(sample, "smallest")), "1,3,2,4,5");
  // the input is never modified
  assert.equal(ids(sample), "1,2,3,4,5");
  // same date and amount: ordered by name, then id, every time
  const ties = [tx("z", "Same", 5, "2026-10-01"), tx("y", "Same", 5, "2026-10-01"), tx("x", "Alpha", 5, "2026-10-01")];
  assert.equal(ids(sortTransactions(ties, "newest")), "x,y,z");
  assert.equal(ids(sortTransactions([...ties].reverse(), "newest")), "x,y,z");
  assert.equal(ids(sortTransactions(ties, "largest")), "x,y,z");
});

test("grouping puts consecutive same-day transactions together", () => {
  const groups = groupByDate(sortTransactions(sample, "newest"));
  assert.deepEqual(groups.map((group) => [group.date, ids(group.items)]), [
    ["2026-10-28", "2,1"], ["2026-10-26", "3"], ["2026-10-15", "5"], ["2026-10-01", "4"],
  ]);
  assert.deepEqual(groupByDate([]), []);
  // grouping follows the given order: it does not re-sort
  const mixed = [tx("a", "A", 1, "2026-10-02"), tx("b", "B", 1, "2026-10-01"), tx("c", "C", 1, "2026-10-02")];
  assert.equal(groupByDate(mixed).length, 3);
});

test("the count and total are exact", () => {
  assert.deepEqual(summarizeList([]), { count: 0, total: 0 });
  assert.deepEqual(summarizeList(sample), { count: 5, total: 1252.75 });
  const dimes = Array.from({ length: 30 }, (_, index) => tx(String(index), "Dime", 0.1, "2026-10-01"));
  assert.equal(summarizeList(dimes).total, 3); // 30 x $0.10 with no floating-point drift
});

test("every sort option has a label for the menu", () => {
  assert.deepEqual(Object.keys(sortLabels).sort(), ["largest", "newest", "oldest", "smallest"]);
});

// ---- the HTML for the rows ----
const escapeHtml = (value: unknown) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const context = {
  categories: [
    { id: "food", name: "Food", color: "#e7745a" },
    { id: "transport", name: "Transport", color: "#537f9e" },
    { id: "other", name: "Other", color: "#d9d5c7" },
    { id: "c-1a2b3c4d", name: "Fun <Money>", color: "#4bacc6" },
  ],
  money: (amount: number) => `$${amount.toFixed(2)}`,
  escape: escapeHtml,
};
const count = (text: string, pattern: RegExp) => (text.match(pattern) ?? []).length;

test("newest and oldest show a heading for each day; the size sorts do not", () => {
  const newest = renderRows(sortTransactions(sample, "newest"), "newest", context);
  assert.equal(count(newest, /class="tx-day"/g), 4);
  assert.match(newest, /Wed, Oct 28/); // 2026-10-28 is a Wednesday
  assert.equal(count(newest, /class="tx-row"/g), 5);
  assert.ok(newest.indexOf("Oct 28") < newest.indexOf("Oct 26"), "newest day first");
  const oldest = renderRows(sortTransactions(sample, "oldest"), "oldest", context);
  assert.ok(oldest.indexOf("Oct 1<") < oldest.indexOf("Oct 28"), "oldest day first");
  for (const sort of ["largest", "smallest"] as const) {
    const flat = renderRows(sortTransactions(sample, sort), sort, context);
    assert.equal(count(flat, /class="tx-day"/g), 0);
    assert.equal(count(flat, /class="tx-row"/g), 5);
  }
  assert.equal(renderRows([], "newest", context), "");
});

test("each row has the merchant, where it came from, the amount and a category menu", () => {
  const html = renderRows([sample[0]!], "newest", context);
  assert.match(html, /<strong>Starbucks<\/strong>/);
  assert.match(html, /Checking \u00b7 First Platypus Bank/);
  assert.match(html, /class="tx-amount">\$6\.50</);
  assert.match(html, /data-transaction-id="1"/);
  assert.equal(count(html, /<option /g), 4, "one menu entry per category");
  assert.match(html, /<option value="food" selected>Food<\/option>/);
  assert.equal(count(html, /selected/g), 1, "only the current category is selected");
  assert.match(html, /background:#e7745a/);
});

test("only manual entries get Edit and Delete, and say they were added by hand", () => {
  const bank = renderRows([sample[0]!], "newest", context);
  assert.equal(count(bank, /data-edit-manual/g), 0);
  assert.equal(count(bank, /data-delete-manual/g), 0);
  const manual = renderRows([sample[4]!], "newest", context);
  assert.match(manual, /data-edit-manual="5"/);
  assert.match(manual, /data-delete-manual="5"/);
  assert.match(manual, /Added by hand/);
  assert.doesNotMatch(manual, /First Platypus/);
});

test("merchant and category names are escaped, so they cannot inject HTML", () => {
  const hostile = tx("x", `<img src=x onerror="alert(1)">`, 5, "2026-10-01", "c-1a2b3c4d", {
    account: `<script>alert(2)</script>`,
    institution: `"><b>`,
  });
  const html = renderRows([hostile], "newest", context);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /Fun &lt;Money&gt;/); // a category name with brackets
  // quotes cannot break out of an attribute either
  assert.doesNotMatch(html, /data-merchant="<img/);
  const manual = renderRows([tx(`id"><x`, "ok", 1, "2026-10-01", "food", { manual: true })], "newest", context);
  assert.doesNotMatch(manual, /<x/);
});

test("a transaction in a deleted category still draws, with a neutral colour", () => {
  const html = renderRows([tx("g", "Ghost", 3, "2026-10-01", "c-gone")], "newest", context);
  assert.match(html, /background:#d9d5c7/);
  assert.equal(count(html, /selected/g), 0, "no category is marked, so the menu shows its first entry");
});
