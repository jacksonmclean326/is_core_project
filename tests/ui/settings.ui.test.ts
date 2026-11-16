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

test("dark mode is saved to the account and applied locally", async () => {
  const page = await openPage("settings");

  assert.equal(page.$("#theme-toggle").checked, false);
  await page.click("#theme-toggle");
  await page.flush(20);
  assert.equal(page.$("#theme-toggle").checked, true);
  assert.equal(page.window.document.documentElement.dataset.theme, "dark");
  assert.equal(page.window.localStorage.getItem("money-man-theme"), "dark");
  assert.ok(page.calls.some((call) =>
    call.path === "/api/account/preferences" &&
    call.method === "PATCH" &&
    call.body.preference === "dark_mode" &&
    call.body.enabled === true,
  ));

  await page.click("#theme-toggle");
  await page.flush(20);
  assert.equal(page.window.document.documentElement.dataset.theme, undefined);
  assert.equal(page.window.localStorage.getItem("money-man-theme"), "light");
  assert.ok(page.calls.some((call) => call.body?.preference === "dark_mode" && call.body.enabled === false));
});

test("Settings reflects the dark-mode choice saved to the account", async () => {
  const page = await openPage("settings", {
    storage: { "money-man-theme": "dark" },
    routes: {
      "/api/account": () => [200, {
        id: "u1",
        email: "demo@example.com",
        dark_mode: true,
        daily_sync: true,
        budget_reminders: true,
        leaderboard_visibility: true,
      }],
      "/api/auth/session": () => [200, {
        user: { id: "u1", email: "demo@example.com", dark_mode: true },
      }],
    },
  });

  assert.equal(page.window.document.documentElement.dataset.theme, "dark");
  assert.equal(page.$("#theme-toggle").checked, true);
});

test("the saved account theme is restored across app pages", async () => {
  const page = await openPage("home", {
    routes: {
      "/api/auth/session": () => [200, {
        user: { id: "u1", email: "demo@example.com", dark_mode: true },
      }],
    },
  });

  assert.equal(page.window.document.documentElement.dataset.theme, "dark");
});

test("a failed dark-mode save restores the current theme and reports the error", async () => {
  const page = await openPage("settings", {
    routes: {
      "/api/account/preferences": () => [500, { error: "Could not save setting." }],
    },
  });

  await page.click("#theme-toggle");
  await page.flush(20);
  assert.equal(page.$("#theme-toggle").checked, false);
  assert.equal(page.window.document.documentElement.dataset.theme, undefined);
  assert.match(page.$("#theme-feedback").textContent, /Could not save setting/);
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
        streak: 0,
      }],
      // With visibility off, the server leaves the user out of the rankings and says so.
      "/api/leaderboard": () => [200, {
        challenge: { id: "eating-out", title: "The Eating Out Challenge", description: "Restaurant and takeout purchases count.", month: "2026-11", daysRemaining: 17 },
        entries: [{ id: "f1", name: "Ana Saver", isYou: false, score: 80, status: "on-track" }],
        visible: false,
        updatedAt: "2026-11-14T12:00:00Z",
      }],
      "/api/friends": () => [200, { friends: [{ id: "f1", name: "Ana Saver" }] }],
    },
  });

  assert.equal(page.$("#leaderboard-visibility-note").hidden, false);
  assert.doesNotMatch(page.$("#ranking-list").textContent, /\(you\)/);
  assert.doesNotMatch(page.$("#leaderboard-podium").textContent, /\(you\)/);
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