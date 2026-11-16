import { test } from "node:test";
import assert from "node:assert/strict";
import { plainText } from "../src/shared/plain-text.js";
import { parseCategoryPreferences } from "../src/server/api/category-preferences.js";

test("chat replies lose Markdown but keep ordinary text and maths", () => {
  assert.equal(
    plainText("Open **Settings** → `Budget & income`.\n- Save it\n### Done\nKeep 5*3 and 2 * 4."),
    "Open Settings → Budget & income.\nSave it\nDone\nKeep 5*3 and 2 * 4.",
  );
  assert.equal(plainText("90 % of your budget"), "90% of your budget");
  assert.equal(plainText("  You spent $2,150 in October 2026 (last month).  "), "You spent $2,150 in October 2026 (last month).");
});

test("category preference validation accepts safe per-user settings and rejects malformed values", () => {
  assert.deepEqual(parseCategoryPreferences({
    food: { name: "Dining", visible: false },
    "c-1a2b3c4d": { visible: true },
  }), {
    food: { name: "Dining", visible: false },
    "c-1a2b3c4d": { visible: true },
  });
  assert.equal(parseCategoryPreferences({ food: { name: "<script>" } }), null);
  assert.equal(parseCategoryPreferences({ food: { visible: "false" } }), null);
  assert.equal(parseCategoryPreferences({ arbitrary: { visible: true } }), null);
  assert.equal(parseCategoryPreferences({ food: {} }), null);
});
