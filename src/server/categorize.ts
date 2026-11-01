export const categoryIds = ["housing", "food", "transport", "utilities", "education", "personal", "other"] as const;
export type BuiltInCategoryId = (typeof categoryIds)[number];
/** A built-in id ("food") or a user-created key ("c-1a2b3c4d"). */
export type CategoryId = string;

/**
 * Bump this whenever the rules below change. Saved transactions are re-sorted with the new rules
 * the next time each bank syncs.
 */
export const categorizerVersion = 3;

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

// ---------------------------------------------------------------------------------------------
// How a transaction is sorted (first match wins). Precision matters more than coverage: a merchant we
// are unsure about stays in Other rather than landing in the wrong category.
//
//   0. Not spending at all (income, refunds, transfers, credit-card payments): skipped.
//   1. Plaid's detailed category, then its broader category. Plaid knows the merchant, so its answer
//      beats anything we guess from the name.
//   2. Bank fees, loans, taxes and donations stay in Other: no keyword can rescue them.
//   3. Well-known brands, matched as whole words ("Uber Eats" is food, "Uber" is transport).
//   4. Careful keyword phrases, used only when Plaid gave us nothing useful.
//   5. Other.
// ---------------------------------------------------------------------------------------------

/** Lowercase, drop apostrophes, and turn every other symbol into a space so patterns can use plain words. */
function simplify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // cafe, not caf + an accent
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Matches any of the phrases as whole words (never inside a longer word). */
function phrases(...list: string[]): RegExp {
  return new RegExp(`(?<![a-z0-9])(?:${list.join("|")})(?![a-z0-9])`);
}

/** Well-known brands (whole words, after simplifying: no accents, apostrophes or symbols). Exported so tests can check every one. */
export const brandPhrases: Record<Exclude<BuiltInCategoryId, "housing" | "other">, string[]> = {
  food: [
    "uber eats", "ubereats", "doordash", "grubhub", "postmates", "instacart", "starbucks", "dunkin", "mcdonalds",
    "chipotle", "chick fil a", "taco bell", "panera", "wendys", "burger king", "dominos", "papa johns", "pizza hut",
    "kfc", "popeyes", "five guys", "in n out", "sweetgreen", "cava", "panda express", "jimmy johns", "jersey mikes",
    "little caesars", "dairy queen", "culvers", "whole foods", "trader joes", "safeway", "kroger", "aldi", "publix",
    "food lion", "wegmans", "h e b", "meijer", "sprouts farmers market", "winco", "cafe rio",
  ],
  transport: [
    "uber", "lyft", "amtrak", "greyhound", "shell oil", "shell service station", "exxon", "exxonmobil", "chevron",
    "bp gas", "bp products", "ezpass", "e zpass", "ez pass", "zipcar", "turo", "united airlines",
    "delta air lines", "delta airlines", "american airlines", "southwest airlines", "jetblue", "alaska airlines",
    "spirit airlines", "frontier airlines",
  ],
  utilities: [
    "comcast", "xfinity", "charter communications", "spectrum internet", "spectrum mobile", "spectrum cable",
    "verizon wireless", "verizon fios", "t mobile", "mint mobile", "cricket wireless", "google fi", "con edison",
    "pg e", "duke energy", "dominion energy", "rocky mountain power", "waste management", "republic services",
  ],
  education: [
    "chegg", "coursera", "udemy", "pearson education", "pearson vue", "khan academy", "campus bookstore",
    "textbook", "textbooks", "tuition", "bursar", "registrar",
  ],
  personal: [
    "netflix", "spotify", "hulu", "disney", "hbo", "apple music", "apple tv", "youtube premium", "prime video",
    "paramount plus", "paramountplus", "peacock tv", "peacocktv", "crunchyroll", "steam games", "steam purchase",
    "steampowered", "steamgames", "playstation", "xbox", "nintendo", "audible", "cvs", "walgreens", "rite aid",
    "planet fitness", "anytime fitness", "orangetheory", "equinox fitness", "equinox gym", "sephora", "ulta",
    "old navy", "uniqlo", "urban outfitters",
  ],
};

const brandRules = (Object.entries(brandPhrases) as [BuiltInCategoryId, string[]][]).map(
  ([category, list]): [BuiltInCategoryId, RegExp] => [category, phrases(...list)],
);

/** Plaid's detailed categories (personal_finance_category.detailed) that need their own answer. */
export const detailedMap: Record<string, BuiltInCategoryId> = {
  RENT_AND_UTILITIES_RENT: "housing",
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: "housing",
  LOAN_PAYMENTS_CAR_PAYMENT: "transport",
  GENERAL_SERVICES_INSURANCE: "housing",
  GENERAL_SERVICES_EDUCATION: "education",
  GENERAL_SERVICES_AUTOMOTIVE: "transport",
  GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS: "education",
  TRAVEL_FLIGHTS: "transport",
  TRAVEL_RENTAL_CARS: "transport",
  TRAVEL_LODGING: "personal",
  TRAVEL_OTHER_TRAVEL: "personal",
};

/** Plaid's broader categories (personal_finance_category.primary). */
export const primaryMap: Record<string, BuiltInCategoryId> = {
  FOOD_AND_DRINK: "food",
  TRANSPORTATION: "transport",
  RENT_AND_UTILITIES: "utilities",
  HOME_IMPROVEMENT: "housing",
  ENTERTAINMENT: "personal",
  PERSONAL_CARE: "personal",
  MEDICAL: "personal",
  GENERAL_MERCHANDISE: "personal",
  TRAVEL: "personal",
};

/**
 * Last resort when Plaid has nothing useful. Phrases are specific on purpose ("water bill", not "water").
 * Categories are checked in this order. Exported so tests can check every phrase.
 */
export const fallbackPhrases: Record<Exclude<BuiltInCategoryId, "other">, string[]> = {
  food: [
    "restaurant", "cafe", "coffee", "pizza", "pizzeria", "grill", "diner", "bakery", "sushi", "burger", "burgers",
    "bbq", "barbecue", "taqueria", "bistro", "deli", "supermarket", "grocery", "groceries", "food co op", "farmers market",
  ],
  transport: ["gas station", "parking", "taxi", "rideshare", "toll road", "tolls", "transit"],
  utilities: [
    "electric", "electricity", "power company", "gas company", "water bill", "water utility", "water utilities",
    "water department", "water district", "water service", "water works", "sewer", "internet", "broadband", "wireless",
    "phone bill", "utility", "utilities",
  ],
  housing: [
    "apartment", "apartments", "landlord", "property management", "mortgage", "renters insurance", "rent payment",
    "hoa", "dormitory", "housing",
  ],
  education: ["bookstore", "textbook", "tuition", "university", "college", "school", "print shop", "printing services"],
  personal: [
    "pharmacy", "gym", "fitness", "salon", "barbershop", "barber", "clothing", "apparel", "cinema", "movie", "movies",
    "theater", "theatre", "streaming", "tattoo",
  ],
};

/** "Rent" on its own means rent, but not "Rent the Runway", "Rent a Car" or "Rent-A-Center". */
const bareRent = /(?<![a-z0-9])rent(?! (?:the|a|an)(?![a-z0-9]))(?![a-z0-9])/;

const fallbackRules: [BuiltInCategoryId, RegExp][] = (
  Object.entries(fallbackPhrases) as [BuiltInCategoryId, string[]][]
).map(([category, list]): [BuiltInCategoryId, RegExp] => {
  const base = phrases(...list);
  return category === "housing" ? [category, new RegExp(`${base.source}|${bareRent.source}`)] : [category, base];
});

/** Plaid categories that are conclusive: no keyword in the name may move these out of Other. */
const stayInOther = new Set(["BANK_FEES", "GOVERNMENT_AND_NON_PROFIT", "LOAN_PAYMENTS"]);

/** Every broad category Plaid uses, longest first, so a detailed name can be traced back to its broad one. */
const knownPrimaries = [
  ...new Set([
    ...Object.keys(primaryMap),
    ...stayInOther,
    "INCOME", "TRANSFER_IN", "TRANSFER_OUT", "GENERAL_SERVICES", "OTHER",
  ]),
].sort((a, b) => b.length - a.length);

/** The broad category, using the detailed one if the broad one is missing ("FOOD_AND_DRINK_COFFEE" -> "FOOD_AND_DRINK"). */
function broadCategory(primary: string, detailed: string): string {
  if (primary) return primary;
  return knownPrimaries.find((known) => detailed.startsWith(`${known}_`)) ?? "";
}

/**
 * Returns the budget category for a transaction, or null when the transaction
 * is not spending (income, refunds, transfers, credit-card payments).
 */
export function categorizeTransaction(transaction: CategorizableTransaction): BuiltInCategoryId | null {
  const detailed = (transaction.detailedCategory ?? "").trim().toUpperCase();
  const primary = broadCategory((transaction.primaryCategory ?? "").trim().toUpperCase(), detailed);

  if (!Number.isFinite(transaction.amount) || !(transaction.amount > 0)) return null;
  if (primary === "INCOME" || primary === "TRANSFER_IN" || primary === "TRANSFER_OUT") return null;
  if (detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") return null;

  const fromPlaid = detailedMap[detailed] ?? primaryMap[primary];
  if (fromPlaid) return fromPlaid;
  if (stayInOther.has(primary)) return "other";

  const text = simplify(`${transaction.merchantName ?? ""} ${transaction.name}`);
  for (const [category, pattern] of brandRules) {
    if (pattern.test(text)) return category;
  }
  for (const [category, pattern] of fallbackRules) {
    if (pattern.test(text)) return category;
  }
  return "other";
}
