// Help-page navigation and FAQ disclosures, using the real page markup and scripts in jsdom.
// @ts-nocheck
import assert from "node:assert/strict";
import { test } from "node:test";
import { openPage } from "./harness.ts";

test("Settings links to the Help page with a return button and working FAQ disclosures", async () => {
  const settings = await openPage("settings", { runScript: false });
  assert.equal(settings.$("#help-link").getAttribute("href"), "/help");

  const help = await openPage("help");
  assert.equal(help.$("#help-title").textContent, "Help & support");
  assert.equal(help.$(".help-back").getAttribute("href"), "/settings");
  assert.ok(help.$$("details.help-faq").length >= 12);
  assert.equal(help.$(".help-faq").open, false);
  await help.click(".help-faq summary");
  assert.equal(help.$(".help-faq").open, true);
  assert.equal(help.$('a[href="/privacy"]').textContent.trim(), "Privacy & data");
});