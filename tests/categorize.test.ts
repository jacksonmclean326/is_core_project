import assert from "node:assert/strict";
import { test } from "node:test";
import type { Transaction } from "plaid";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "test";

const { applyOverrides, categorizeTransaction, isBuiltInCategory, isCategoryKey, normalizeMerchant } = await import("../src/server/categorize.ts");
const { cleanCategoryName, nextCustomColor } = await import("../src/server/api/categories.ts");
const { HttpError } = await import("../src/server/errors.ts");
const { toStoredTransactions } = await import("../src/server/api/transactions.ts");

const cat = (name: string, amount = 10, primary?: string, detailed?: string, merchant?: string) =>
  categorizeTransaction({ name, amount, primaryCategory: primary, detailedCategory: detailed, merchantName: merchant });

test("keyword rules win and spending is sorted into the 7 categories", () => {
  assert.equal(cat("Uber 063015 SF**POOL**"), "transport");
  assert.equal(cat("Uber Eats"), "food");
  assert.equal(cat("Starbucks", 5, "FOOD_AND_DRINK"), "food");
  assert.equal(cat("Campus Bookstore"), "education");
  assert.equal(cat("Comcast Internet"), "utilities");
  assert.equal(cat("Maple Apartments Rent", 540), "housing");
  assert.equal(cat("Netflix", 15), "personal");
});

test("falls back to Plaid hints, then Other", () => {
  assert.equal(cat("Zxqv LLC", 900, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT"), "housing");
  assert.equal(cat("Zxqv LLC", 60, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY"), "utilities");
  assert.equal(cat("Zxqv LLC", 380, "TRAVEL", "TRAVEL_FLIGHTS"), "transport");
  assert.equal(cat("Zxqv LLC", 210, "TRAVEL", "TRAVEL_LODGING"), "personal");
  assert.equal(cat("Zxqv LLC", 20), "other");
});

test("non-spending is skipped", () => {
  assert.equal(cat("Payroll", -2000, "INCOME"), null);
  assert.equal(cat("Refund", -12), null);
  assert.equal(cat("Savings move", 100, "TRANSFER_OUT"), null);
  assert.equal(cat("Card payment", 300, "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"), null);
});

test("maps Plaid transactions to stored transactions", () => {
  const plaid = [
    { transaction_id: "t1", account_id: "a1", name: "UNITED AIRLINES", merchant_name: "United Airlines", amount: -500, date: "2026-10-20" },
    { transaction_id: "t2", account_id: "a1", name: "McDonald's", merchant_name: "McDonald's", amount: 12.5, date: "2026-10-21",
      personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_FAST_FOOD", confidence_level: "HIGH" } },
    { transaction_id: "t3", account_id: "zz", name: "Sparkfun", merchant_name: null, amount: 40, date: "2026-10-22" },
  ] as unknown as Transaction[];
  const result = toStoredTransactions(plaid, [{ account_id: "a1", name: "Plaid Checking" }], "First Platypus Bank");
  assert.deepEqual(result.map((item) => [item.id, item.category, item.account]), [
    ["t2", "food", "Plaid Checking"],
    ["t3", "other", "Linked account"],
  ]);
  assert.equal(result[0]?.institution, "First Platypus Bank");
});

test("merchant names normalize so receipts from the same shop match", () => {
  assert.equal(normalizeMerchant("STARBUCKS #1234"), "starbucks");
  assert.equal(normalizeMerchant("Starbucks 5678"), "starbucks");
  assert.equal(normalizeMerchant("  Uber   Eats  "), "uber eats");
  assert.equal(normalizeMerchant("McDonald's"), "mcdonald s");
  assert.equal(normalizeMerchant("12345"), "");
  assert.equal(normalizeMerchant("Food Lion"), normalizeMerchant("FOOD LION #88"));
});

test("category keys are validated", () => {
  for (const good of ["food", "c-1a2b3c4d", "other"]) assert.equal(isCategoryKey(good), true, good);
  for (const bad of ["", "Food", "c_1", "a b", "x".repeat(41), "../etc", "food;", null, 5]) assert.equal(isCategoryKey(bad), false, String(bad));
  assert.equal(isBuiltInCategory("food"), true);
  assert.equal(isBuiltInCategory("c-1a2b3c4d"), false);
});

test("user choices override automatic categories in the right order", () => {
  const overrides = {
    validKeys: new Set(["food", "other", "personal", "c-aaaaaaaa"]),
    merchantRules: new Map([["chipotle", "c-aaaaaaaa"], ["netflix", "gone"]]),
    manual: new Map([["tx-1", "other"], ["tx-2", "deleted-category"]]),
  };
  // no overrides -> automatic
  assert.equal(applyOverrides("food", { id: "tx-9", name: "Chipotle" }, undefined), "food");
  // merchant rule beats automatic
  assert.equal(applyOverrides("food", { id: "tx-9", name: "CHIPOTLE #12" }, overrides), "c-aaaaaaaa");
  // manual pick beats the merchant rule
  assert.equal(applyOverrides("food", { id: "tx-1", name: "Chipotle" }, overrides), "other");
  // choices pointing at a category that no longer exists are ignored
  assert.equal(applyOverrides("food", { id: "tx-2", name: "Some Cafe" }, overrides), "food");
  assert.equal(applyOverrides("personal", { id: "tx-8", name: "Netflix" }, overrides), "personal");
  // unrelated transaction keeps its automatic category
  assert.equal(applyOverrides("transport", { id: "tx-7", name: "Lyft" }, overrides), "transport");
});

test("custom category names are cleaned and validated", () => {
  assert.equal(cleanCategoryName("  Eating   Out "), "Eating Out");
  assert.equal(cleanCategoryName("a".repeat(24)).length, 24);
  const rejects = (value: unknown) =>
    assert.throws(() => cleanCategoryName(value), (error: unknown) => error instanceof HttpError && error.status === 400);
  rejects("");
  rejects("   ");
  rejects("a".repeat(25));
  rejects("<script>");
  rejects(undefined);
  rejects(42);
});

test("custom colors are handed out without repeats until they run out", () => {
  const taken: { key: string; name: string; color: string }[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < 12; index += 1) {
    const color = nextCustomColor(taken);
    assert.equal(seen.has(color), false, `color ${color} repeated at ${index}`);
    seen.add(color);
    taken.push({ key: `c-${index}`, name: `n${index}`, color });
  }
  assert.equal(typeof nextCustomColor(taken), "string");
});
