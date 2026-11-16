// The first screen new and returning Money Man users see.
// @ts-nocheck
import assert from "node:assert/strict";
import { test } from "node:test";
import { openPage } from "./harness.ts";

test("the login page explains Money Man is made for college budgeting and keeps account access clear", async () => {
  const page = await openPage("auth");

  assert.match(page.$("#auth-story-title").textContent, /budget that works with student life/i);
  assert.match(page.$(".auth-story-description").textContent, /monthly budget, track everyday spending/i);
  assert.equal(page.$(".auth-story-image").getAttribute("src"), "../../assets/money-man-mascot.png");
  assert.ok(page.$(".auth-story-image").getAttribute("alt").length > 0);
  assert.equal(page.$$(".auth-benefits li").length, 3);
  assert.equal(page.$("#auth-submit").textContent, "Sign in");

  await page.click("#auth-switch");
  assert.equal(page.$("#auth-title").textContent, "Create your account.");
  assert.equal(page.$("#auth-name").hidden, false);
  assert.equal(page.$("#auth-submit").textContent, "Create account");
  assert.equal((await page.axe()).violations.length, 0);
});
