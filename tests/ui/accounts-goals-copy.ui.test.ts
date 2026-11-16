import assert from "node:assert/strict";
import { test } from "node:test";
import { openPage } from "./harness.ts";

test("the goals editor explains that Done editing goals closes the panel", async () => {
  const page = await openPage("details");
  await page.click("#edit-goals-link");

  assert.equal(page.$("#goals-panel").hidden, false);
  assert.equal(page.$("#goals-done").textContent.trim(), "Done editing goals");
  assert.match(page.$("#goals-panel .section-note").textContent, /select “Done editing goals” to close this panel/i);

  await page.click("#goals-done");
  assert.equal(page.$("#goals-panel").hidden, true);
});

test("Accounts clarifies Plaid sign-in and what Money Man receives", async () => {
  const page = await openPage("accounts", { runScript: false });
  const note = page.$(".bank-security-note").textContent;

  assert.match(note, /bank sign-in stays with Plaid/i);
  assert.match(note, /does not receive your bank login password/i);
  assert.match(note, /Plaid to share account details, balances, and transactions with Money Man/i);
});
