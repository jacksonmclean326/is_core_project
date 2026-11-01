export const categoryIds = ["housing", "food", "transport", "utilities", "education", "personal", "other"] as const;
export type BuiltInCategoryId = (typeof categoryIds)[number];
/** A built-in id ("food") or a user-created key ("c-1a2b3c4d"). */
export type CategoryId = string;

const categoryKeyPattern = /^[a-z0-9-]{1,40}$/;

export function isCategoryKey(value: unknown): value is CategoryId {
  return typeof value === "string" && categoryKeyPattern.test(value);
}

export function isBuiltInCategory(value: unknown): value is BuiltInCategoryId {
  return typeof value === "string" && (categoryIds as readonly string[]).includes(value);
}

/**
 * Stable key for a merchant so "STARBUCKS #1234" and "Starbucks 5678" match:
 * lowercase letters only, single spaces.
 */
export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface CategoryOverrides {
  /** category keys the user may assign (built-ins plus their custom categories) */
  validKeys: Set<CategoryId>;
  /** normalized merchant -> category key */
  merchantRules: Map<string, CategoryId>;
  /** plaid transaction id -> category key (explicit per-transaction choice) */
  manual: Map<string, CategoryId>;
}

/** Applies the user's own choices on top of the automatic category. */
export function applyOverrides(
  automatic: CategoryId,
  transaction: { id: string; name: string },
  overrides: CategoryOverrides | undefined,
): CategoryId {
  if (!overrides) return automatic;
  const manual = overrides.manual.get(transaction.id);
  if (manual && overrides.validKeys.has(manual)) return manual;
  const rule = overrides.merchantRules.get(normalizeMerchant(transaction.name));
  if (rule && overrides.validKeys.has(rule)) return rule;
  return automatic;
}

export interface CategorizableTransaction {
  name: string;
  merchantName?: string | null;
  amount: number;
  primaryCategory?: string | null;
  detailedCategory?: string | null;
}

// Highest priority: keywords found in the merchant/transaction name.
const keywordRules: [BuiltInCategoryId, RegExp][] = [
  ["education", /\b(bookstore|textbook|chegg|tuition|university|college|coursera|udemy|print(ing)? services?|school|pearson)\b/],
  ["transport", /\b(uber(?! eats)|lyft|taxi|transit|metro|amtrak|shell|chevron|exxon|bp|gas station|fuel|parking|toll|zipcar|bird|lime|greyhound|airlines?|delta|united air|southwest)\b/],
  ["food", /\b(uber eats|doordash|grubhub|instacart|starbucks|dunkin|mcdonald'?s|chipotle|subway|chick-?fil-?a|taco bell|pizza|cafe|coffee|restaurant|grill|diner|bakery|kitchen|bar & grill|market|grocery|co-?op|safeway|kroger|walmart grocery|trader joe'?s|whole foods|aldi|costco|sushi|burger|bbq|deli)\b/],
  ["utilities", /\b(electric|power company|gas & electric|water|sewer|internet|comcast|xfinity|spectrum|verizon|at&t|t-mobile|mint mobile|utility|utilities|phone bill|wireless|rocky mountain power|dominion)\b/],
  ["housing", /\b(rent|apartment|landlord|property management|mortgage|renter'?s insurance|lease|hoa|housing|dorm)\b/],
  ["personal", /\b(pharmacy|cvs|walgreens|netflix|spotify|hulu|disney\+?|hbo|youtube premium|apple music|streaming|gym|fitness|salon|barber|clothing|apparel|h&m|zara|nike|target|amazon|best buy|steam|playstation|xbox|nintendo|cinema|theater|movie)\b/],
];

// Plaid's own detailed category hints (personal_finance_category.detailed).
const detailedMap: Record<string, BuiltInCategoryId> = {
  RENT_AND_UTILITIES_RENT: "housing",
  HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE: "housing",
  HOME_IMPROVEMENT_FURNITURE: "housing",
  GENERAL_SERVICES_INSURANCE: "housing",
  GENERAL_SERVICES_EDUCATION: "education",
  GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS: "education",
  GENERAL_SERVICES_AUTOMOTIVE: "transport",
};

const primaryMap: Record<string, BuiltInCategoryId> = {
  RENT_AND_UTILITIES: "utilities",
  FOOD_AND_DRINK: "food",
  TRANSPORTATION: "transport",
  TRAVEL: "transport",
  HOME_IMPROVEMENT: "housing",
  ENTERTAINMENT: "personal",
  PERSONAL_CARE: "personal",
  MEDICAL: "personal",
  GENERAL_MERCHANDISE: "personal",
};

/**
 * Returns the budget category for a transaction, or null when the transaction
 * is not spending (income, refunds, transfers, credit-card payments).
 */
export function categorizeTransaction(transaction: CategorizableTransaction): BuiltInCategoryId | null {
  const primary = transaction.primaryCategory ?? "";
  const detailed = transaction.detailedCategory ?? "";

  if (transaction.amount <= 0) return null;
  if (primary === "INCOME" || primary === "TRANSFER_IN" || primary === "TRANSFER_OUT") return null;
  if (detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") return null;

  const text = `${transaction.merchantName ?? ""} ${transaction.name}`.toLowerCase();
  for (const [category, pattern] of keywordRules) {
    if (pattern.test(text)) return category;
  }
  return detailedMap[detailed] ?? primaryMap[primary] ?? "other";
}
