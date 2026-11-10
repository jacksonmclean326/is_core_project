// The signed-in user's streak is read from the account API on Home and Friends.
// @ts-nocheck
import assert from "node:assert/strict";
import { test } from "node:test";
import { openPage } from "./harness.ts";

const account = (streak) => [200, {
  id: "u1",
  email: "demo@example.com",
  user_metadata: null,
  daily_sync: true,
  budget_reminders: true,
  leaderboard_visibility: true,
  streak,
}];

test("Home displays the signed-in user's Supabase streak", async () => {
  const page = await openPage("home", {
    routes: { "/api/account": () => account(7) },
  });

  assert.equal(page.$("#streak-count").textContent, "7");
  assert.equal(page.$(".streak-indicator").getAttribute("aria-label"), "7 day streak");
});

test("the signed-in user's leaderboard row displays the Supabase streak", async () => {
  const page = await openPage("leaderboard", {
    routes: { "/api/account": () => account(4) },
  });
  const ownRow = page.$$(".friend-row").find((row) => row.textContent.includes("(you)"));

  assert.ok(ownRow);
  assert.match(ownRow.querySelector(".friend-streak").textContent, /4-day streak/);
});