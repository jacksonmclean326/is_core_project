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

// The Friends page shows normalized monthly challenge scores and marks the signed-in user's own row.
test("the leaderboard marks the signed-in user's own ranking", async () => {
  const entry = (id, name, isYou, score) => ({ id, name, isYou, score, status: "in-progress" });
  const page = await openPage("leaderboard", {
    routes: {
      "/api/account": () => account(4),
      "/api/friends": () => [200, { friends: [{ id: "f1", name: "Ana Saver" }] }],
      "/api/leaderboard": () => [200, {
        challenge: { id: "round-up", title: "The Spare-Change Round-Up Race", description: "Round purchases.", month: "2026-11", daysRemaining: 17 },
        entries: [entry("f1", "Ana Saver", false, 80), entry("u1", "Demo User", true, 50)],
        visible: true,
        updatedAt: "2026-11-14T12:00:00Z",
      }],
    },
  });
  const ownRow = page.$$(".ranking-row").find((row) => row.textContent.includes("(you)"));

  assert.ok(ownRow);
  assert.match(ownRow.textContent, /Demo User \(you\)/);
  assert.match(ownRow.textContent, /50%/);
  const progress = ownRow.querySelector('[role="progressbar"]');
  assert.equal(progress.getAttribute("aria-valuenow"), "50");
  assert.doesNotMatch(ownRow.textContent, /\$\s*\d|\b\d+\.\d{2}\b/);
  assert.match(page.$("#challenge-title").textContent, /Spare-Change Round-Up Race/);
  assert.equal(page.$("#challenge-month").textContent, "November 2026 challenge");
  assert.equal(page.$("#challenge-days").textContent, "17");
  assert.equal(page.$("#challenge-end-date").textContent, "Ends Nov 30");
  assert.equal(page.$(".monthly-challenge-card").dataset.challenge, "round-up");
});