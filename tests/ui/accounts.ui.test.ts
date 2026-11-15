// Accounts page labels and balances, and Details totals, run against the real page code in jsdom.
// @ts-nocheck
import assert from "node:assert/strict";
import { test } from "node:test";
import { openPage } from "./harness.ts";

const account = (id, name, type, subtype, balance) => ({
  id, name, officialName: null, mask: "1111", type, subtype, balance, availableBalance: null, currencyCode: "USD", nickname: null, hidden: false,
});

test("account types keep their abbreviations, and loans show as money owed like credit cards", async () => {
  const page = await openPage("accounts", {
    routes: {
      "/api/plaid/accounts": () => [200, {
        connections: [{
          id: "item-1",
          institution: "First Platypus Bank",
          nickname: null,
          lastSyncedAt: "2026-11-14T23:01:06Z",
          accounts: [
            account("a1", "Plaid CD", "depository", "cd", 1000),
            account("a2", "Plaid IRA", "investment", "ira", 320.76),
            account("a3", "Plaid 401k", "investment", "401k", 23631.98),
            account("a4", "Plaid Mortgage", "loan", "mortgage", 56302.06),
            account("a5", "Plaid Credit Card", "credit", "credit card", 410),
            account("a6", "Plaid Checking", "depository", "checking", 110),
          ],
        }],
      }],
    },
  });
  const rows = Object.fromEntries(page.$$(".bank-row").map((row) => [row.querySelector(".bank-info strong").textContent.trim(), row]));
  assert.match(rows["Plaid CD"].textContent, /•••• 1111 · CD\b/);
  assert.match(rows["Plaid IRA"].textContent, /· IRA\b/);
  assert.match(rows["Plaid 401k"].textContent, /· 401\(k\)/);
  assert.match(rows["Plaid Mortgage"].querySelector(".bank-balance").textContent, /−\$56,302\.06\s*Amount owed/);
  assert.match(rows["Plaid Credit Card"].querySelector(".bank-balance").textContent, /−\$410\.00\s*Amount owed/);
  assert.match(rows["Plaid Checking"].querySelector(".bank-balance").textContent, /^\s*\$110\.00\s*Current balance/);
  assert.doesNotMatch(page.$("main").textContent, /Last checked \d+\/\d+\/\d{4}/, "no long numeric date with seconds");
  assert.match(page.$("main").textContent, /Last checked [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}/);
});

test("Details shows the same spending total at the top as in the transaction list", async () => {
  // Cents that used to be rounded away per category: 168.13 + 16.10 + 5.40 = 189.63, which shows as $190.
  const transactions = [
    { id: "t1", name: "Touchstone Climbing", amount: 78.5, date: "2026-10-08", category: "personal", account: "Credit card", institution: "Bank" },
    { id: "t2", name: "FUN", amount: 89.63, date: "2026-10-06", category: "personal", account: "Checking", institution: "Bank" },
    { id: "t3", name: "McDonald's", amount: 12, date: "2026-10-07", category: "food", account: "Checking", institution: "Bank" },
    { id: "t4", name: "Starbucks", amount: 4.1, date: "2026-10-07", category: "food", account: "Checking", institution: "Bank" },
    { id: "t5", name: "Uber", amount: 5.4, date: "2026-10-10", category: "transport", account: "Checking", institution: "Bank" },
  ];
  const page = await openPage("details", { transactions });
  assert.equal(page.$("#summary-spent").textContent, "$190");
  assert.match(page.$("#tx-summary").textContent, /\$190\b/);
  assert.match(page.$(".spending-available").textContent, /Left to spend/);
});
