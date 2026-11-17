// The first-run setup and invite signup flow, using the real page code against a fake API.
// @ts-nocheck
import assert from "node:assert/strict";
import { test } from "node:test";
import { openPage } from "./harness.ts";

test("first-run setup walks through a goal, monthly plan, preferences, manual entry, and an invited friend", async () => {
  const page = await openPage("onboarding", {
    routes: {
      "/api/account": () => [200, {
        id: "u1",
        email: "demo@example.com",
        user_metadata: { onboarding_complete: false, pending_friend_code: "ABC234", currency: "USD" },
        daily_sync: false,
        budget_reminders: true,
        leaderboard_visibility: false,
      }],
      "/api/goals": () => [200, { goals: [] }],
      "/api/friend-code": () => [200, { friendCode: "DEF567" }],
    },
  });

  assert.equal(page.$("#setup-progress li[aria-current='step']").textContent, "Your why");
  assert.equal(page.$('input[name="reason"][value="save_money"]').checked, false);
  assert.equal(page.$("#sync-toggle").checked, false);
  assert.equal(page.$("#reminder-toggle").checked, true);
  assert.equal(page.$("#leaderboard-toggle").checked, false);

  await page.click('input[name="reason"][value="save_money"]');
  await page.type("#first-goal-name", "Emergency fund");
  await page.type("#first-goal-target", "1000");
  await page.submit("#setup-form");
  assert.equal(page.$("#plan-title").closest(".setup-step").hidden, false);

  await page.type("#monthly-income", "4000");
  await page.type("#monthly-budget", "3000");
  await page.click("#setup-next");
  assert.equal(page.$("#preferences-title").closest(".setup-step").hidden, false);

  await page.click("#setup-next");
  assert.equal(page.$("#transactions-title").closest(".setup-step").hidden, false);
  assert.equal(page.$('input[name="entry-mode"][value="manual"]').checked, true);
  await page.click("#setup-next");

  assert.equal(page.$("#friend-title").closest(".setup-step").hidden, false);
  assert.equal(page.$("#friend-code-input").value, "ABC234");
  assert.equal(page.$("#share-invite").disabled, false);
  await page.click("#share-invite");
  assert.match(page.$("#invite-feedback").textContent, /ref=DEF567/);
  await page.click("#setup-back");
  assert.equal(page.$("#transactions-title").closest(".setup-step").hidden, false);
});

test("a referral link opens account creation and carries its friend code through signup", async () => {
  const page = await openPage("auth", {
    search: "?ref=ABC234",
    routes: {
      "/api/auth/session": () => [200, { user: null }],
      "/api/auth/signup": () => [200, { authenticated: false, user: null }],
    },
  });

  assert.equal(page.$("#auth-title").textContent, "Create your account.");
  await page.type("#auth-name", "Demo User");
  await page.type("#auth-email", "demo@example.com");
  await page.type("#auth-password", "long-enough-password");
  await page.submit("#auth-form");

  const signup = page.calls.find((call) => call.path === "/api/auth/signup");
  assert.equal(signup.body.referralCode, "ABC234");
  assert.match(page.$("#auth-feedback").textContent, /finish setting up/i);
});

test("the setup bank step opens Plaid and saves its successful connection", async () => {
  const page = await openPage("onboarding", {
    routes: {
      "/api/account": () => [200, {
        id: "u1", email: "demo@example.com", user_metadata: { currency: "USD" },
        daily_sync: true, budget_reminders: true, leaderboard_visibility: true,
      }],
      "/api/goals": () => [200, { goals: [] }],
      "/api/friend-code": () => [200, { friendCode: "DEF567" }],
      "/api/plaid/link-token": () => [200, { linkToken: "test-link-token" }],
      "/api/plaid/exchange": () => [200, { ok: true }],
    },
  });
  page.window.Plaid = {
    create: (configuration) => ({
      open: () => configuration.onSuccess("public-token", {
        institution: { institution_id: "institution-1", name: "Example Bank" },
      }),
    }),
  };

  await page.click("#connect-bank");

  assert.equal(page.$('input[name="entry-mode"][value="plaid"]').checked, true);
  assert.match(page.$("#bank-feedback").textContent, /bank account is connected/i);
  const exchange = page.calls.find((call) => call.path === "/api/plaid/exchange");
  assert.deepEqual(exchange.body, {
    publicToken: "public-token",
    institutionId: "institution-1",
    institutionName: "Example Bank",
  });
});

test("the Friends page offers a first-friend action and a signup invite link", async () => {
  const page = await openPage("leaderboard", {
    routes: {
      "/api/friends": () => [200, { friends: [] }],
      "/api/friend-code": () => [200, { friendCode: "ABC234" }],
      "/api/leaderboard": () => [200, {
        challenge: { id: "eating-out", title: "The Eating Out Challenge", description: "Restaurant and takeout purchases count.", month: "2026-11", daysRemaining: 15 },
        entries: [],
        visible: true,
        updatedAt: "2026-11-16T12:00:00Z",
      }],
    },
  });
  await page.flush();

  assert.match(page.$("#friend-list").textContent, /No friends yet/);
  assert.equal(page.$("#share-invite").disabled, false);
  await page.click("[data-focus-friend]");
  assert.equal(page.window.document.activeElement.id, "friend-code-input");
  await page.click("#share-invite");
  assert.match(page.$("#friend-code-feedback").textContent, /ref=ABC234/);
});

test("finishing setup saves the first goal, budget, preferences, currency, and onboarding reason", async () => {
  const page = await openPage("onboarding", {
    routes: {
      "/api/account/onboarding": () => [503, { error: "finish marker test" }],
      "/api/account/currency": (path, init, body) => [200, { currency: body.currency }],
      "/api/account/preferences": (path, init, body) => [200, {
        daily_sync: body.preference === "daily_sync" ? body.enabled : true,
        budget_reminders: body.preference === "budget_reminders" ? body.enabled : true,
        leaderboard_visibility: body.preference === "leaderboard_visibility" ? body.enabled : true,
      }],
      "/api/account": () => [200, {
        id: "u1", email: "demo@example.com", user_metadata: { currency: "USD" },
        daily_sync: true, budget_reminders: true, leaderboard_visibility: true,
      }],
      "/api/goals": () => [200, { goals: [] }],
      "/api/friend-code": () => [200, { friendCode: "DEF567" }],
    },
  });

  Object.defineProperty(page.window.crypto, "randomUUID", { value: undefined });

  await page.click('input[name="reason"][value="learn_budgeting"]');
  await page.type("#first-goal-name", "Trip fund");
  await page.type("#first-goal-target", "2500");
  await page.click("#setup-next");
  await page.type("#monthly-income", "5000");
  await page.type("#monthly-budget", "3500");
  await page.click("#setup-next");
  await page.click("#setup-next");
  await page.click("#setup-next");
  await page.click("#skip-friend");
  await page.submit("#setup-form");

  const budget = page.calls.find((call) => call.path === "/api/budget" && call.method === "POST");
  assert.equal(budget.body.monthlyIncome, 5000);
  assert.equal(budget.body.monthlyBudget, 3500);
  const goals = page.calls.find((call) => call.path === "/api/goals" && call.method === "PUT");
  assert.ok(goals, page.$("#setup-feedback").textContent);
  assert.match(goals.body.items[0].id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(goals.body.items[0].name, "Trip fund");
  assert.equal(goals.body.items[0].target, 2500);
  assert.ok(page.calls.filter((call) => call.path === "/api/account/preferences").length === 3);
  const completion = page.calls.find((call) => call.path === "/api/account/onboarding");
  assert.equal(completion.body.reason, "learn_budgeting");
  assert.equal(completion.body.entryMode, "manual");
  assert.match(page.$("#setup-feedback").textContent, /Setup could not be completed/);
});
