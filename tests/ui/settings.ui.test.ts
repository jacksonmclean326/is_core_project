// Preference behavior in Settings and the leaderboard, using the real page code against a fake API.
// @ts-nocheck
import assert from "node:assert/strict";
import { test } from "node:test";
import { currentMonthKey } from "../../src/shared/months.ts";
import { openPage } from "./harness.ts";

test("preference switches load from Supabase, persist changes, and revert failed saves", async () => {
  const preferences = {
    daily_sync: false,
    budget_reminders: true,
    leaderboard_visibility: true,
  };
  const page = await openPage("settings", {
    routes: {
      "/api/account": (path, init, body) => {
        if (path.endsWith("/preferences")) {
          if (body.preference === "daily_sync") {
            return [500, { error: "Could not save setting." }];
          }
          preferences[body.preference] = body.enabled;
          return [200, { ...preferences }];
        }
        return [200, {
          id: "u1",
          email: "demo@example.com",
          email_address: "demo@example.com",
          first_name: "Demo",
          last_name: "User",
          user_metadata: { first_name: "Demo", last_name: "User" },
          ...preferences,
        }];
      },
    },
  });

  assert.equal(page.$("#sync-toggle").checked, false);
  assert.equal(page.$("#reminder-toggle").checked, true);
  await page.click("#reminder-toggle");
  assert.equal(preferences.budget_reminders, false);
  assert.ok(page.calls.some((call) =>
    call.path === "/api/account/preferences" &&
    call.method === "PATCH" &&
    call.body.preference === "budget_reminders" &&
    call.body.enabled === false,
  ));

  await page.click("#sync-toggle");
  assert.equal(page.$("#sync-toggle").checked, false);
  assert.match(page.$("#preferences-feedback").textContent, /Could not save setting/);
});

test("turning leaderboard visibility off hides the user's row and podium entry", async () => {
  const page = await openPage("leaderboard", {
    routes: {
      "/api/account": () => [200, {
        id: "u1",
        email: "demo@example.com",
        user_metadata: null,
        daily_sync: true,
        budget_reminders: true,
        leaderboard_visibility: false,
      }],
    },
  });

  assert.equal(page.$("#leaderboard-hidden-note").hidden, false);
  assert.doesNotMatch(page.$("#friend-list").textContent, /\(you\)/);
  assert.doesNotMatch(page.$(".podium-section").textContent, /\bYou\b/);
});

test("budget reminders are suppressed when the saved preference is false", async () => {
  const page = await openPage("settings", {
    transactions: [
      { id: "food-1", name: "Market", amount: 280, date: "2026-10-28", category: "food", account: "Checking", institution: "Bank" },
    ],
    routes: {
      "/api/account": () => [200, {
        id: "u1",
        email: "demo@example.com",
        email_address: "demo@example.com",
        first_name: "Demo",
        last_name: "User",
        user_metadata: { first_name: "Demo", last_name: "User" },
        daily_sync: true,
        budget_reminders: false,
        leaderboard_visibility: true,
      }],
    },
  });

  assert.equal(page.$("#reminder-toggle").checked, false);
  assert.equal(page.$("#toast").classList.contains("is-visible"), false);
});

test("budget reminders announce a category that reaches 90 percent when enabled", async () => {
  const page = await openPage("settings", {
    transactions: [
      { id: "food-1", name: "Market", amount: 280, date: "2026-10-28", category: "food", account: "Checking", institution: "Bank" },
    ],
  });

  assert.match(page.$("#toast").textContent, /Food is at 93%/);
});

test("monthly budget and income are saved to the current user's Budget record", async () => {
  const page = await openPage("settings");
  await page.type("#monthly-budget", "1800");
  await page.type("#monthly-income", "3000");
  await page.submit("#budget-form");

  const save = page.calls.find((call) => call.path === "/api/budget" && call.method === "POST");
  assert.deepEqual(save.body, { month: currentMonthKey(), monthlyBudget: 1800, monthlyIncome: 3000 });
  assert.match(page.$("#budget-feedback").textContent, /saved to your account/i);
});

test("the current month's saved budget populates Settings", async () => {
  const month = currentMonthKey();
  const page = await openPage("settings", {
    routes: {
      "/api/budget": () => [200, {
        budget: {
          budgetId: "budget-1",
          monthlyBudget: 1700,
          monthlyIncome: 2800,
          month: `${month}-01`,
        },
      }],
    },
  });

  assert.equal(page.$("#monthly-budget").value, "1700");
  assert.equal(page.$("#monthly-income").value, "2800");
});