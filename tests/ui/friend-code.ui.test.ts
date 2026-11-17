// @ts-nocheck
import assert from "node:assert/strict";
import { test } from "node:test";
import { openPage } from "./harness.ts";

test("Copy code writes the exact friend code to the clipboard", async () => {
  const page = await openPage("leaderboard");
  const copied = [];
  Object.defineProperty(page.window.navigator, "clipboard", {
    value: { writeText: async (text) => { copied.push(text); } },
  });

  await page.click("#copy-code");

  assert.deepEqual(copied, ["ABC234"]);
  assert.equal(page.$("#friend-code-feedback").textContent, "Friend code copied.");
});

for (const clipboard of [undefined, {
  async writeText() { throw new Error("Clipboard permission denied"); },
}]) {
  test(`Copy code uses the selected text when clipboard access is ${clipboard ? "denied" : "unavailable"}`, async () => {
    const page = await openPage("leaderboard");
    const { document } = page.window;
    Object.defineProperty(page.window.navigator, "clipboard", { value: clipboard });
    const copied = [];
    document.execCommand = (command) => {
      assert.equal(command, "copy");
      copied.push(document.getSelection().toString());
      return true;
    };

    await page.click("#copy-code");

    assert.deepEqual(copied, ["ABC234"]);
    assert.equal(document.getSelection().toString(), "");
    assert.equal(page.$("#friend-code-feedback").textContent, "Friend code copied.");
  });
}

test("Copy code leaves the code selected for manual copying when automatic copying fails", async () => {
  const page = await openPage("leaderboard");
  const { document } = page.window;
  Object.defineProperty(page.window.navigator, "clipboard", { value: undefined });
  document.execCommand = () => false;

  await page.click("#copy-code");

  assert.equal(document.getSelection().toString(), "ABC234");
  assert.match(page.$("#friend-code-feedback").textContent, /select and copy/i);
  assert.equal(page.$("#friend-code-feedback").classList.contains("is-error"), true);
});
