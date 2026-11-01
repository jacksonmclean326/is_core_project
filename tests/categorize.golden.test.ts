// The "golden list": merchants and edge cases with the category we expect. If a change to the sorting rules
// misfiles any of them, the failing test names the merchant. Add a row whenever you find one sorted wrongly.
//
// How the rules decide (see src/server/categorize.ts): Plaid's own category first, then well-known brands,
// then careful keyword phrases, and otherwise "other". A merchant we are unsure about stays in Other.
import assert from "node:assert/strict";
import { test } from "node:test";

const { brandPhrases, categorizeTransaction, categoryIds, fallbackPhrases } = await import("../src/server/categorize.ts");

type Expected = "housing" | "food" | "transport" | "utilities" | "education" | "personal" | "other" | null;
/** [merchant as the bank shows it, amount, Plaid broad category, Plaid detailed category, expected, merchant_name from Plaid] */
type Row = [string, number, string | undefined, string | undefined, Expected, string?];

const describe = (name: string, primary?: string, detailed?: string, merchant?: string) =>
  `${JSON.stringify(name)}${merchant ? ` (merchant ${JSON.stringify(merchant)})` : ""} [${primary ?? "no hint"}${detailed ? " / " + detailed : ""}]`;

let casesChecked = 0;

/** Runs every row and reports all the wrong ones together, so one run shows the whole picture. */
const check = (rows: Row[]) => {
  casesChecked += rows.length;
  const wrong: string[] = [];
  for (const [name, amount, primary, detailed, expected, merchant] of rows) {
    const actual = categorizeTransaction({ name, amount, primaryCategory: primary, detailedCategory: detailed, merchantName: merchant });
    if (actual !== expected) wrong.push(`${describe(name, primary, detailed, merchant)}: expected ${expected}, got ${actual}`);
  }
  assert.deepEqual(wrong, [], `${wrong.length} of ${rows.length} were sorted wrongly:\n  ${wrong.join("\n  ")}`);
};

// A name with no keyword in it, so only Plaid's category can decide.
const NEUTRAL = "Zxqv LLC";

// ---------------------------------------------------------------------------------------------
// 1. Plaid's complete category list (every broad + detailed category it can return)
// ---------------------------------------------------------------------------------------------
const taxonomy: [string, string, Expected][] = [
  ["INCOME", "INCOME_DIVIDENDS", null], ["INCOME", "INCOME_INTEREST_EARNED", null], ["INCOME", "INCOME_RETIREMENT_PENSION", null],
  ["INCOME", "INCOME_TAX_REFUND", null], ["INCOME", "INCOME_UNEMPLOYMENT", null], ["INCOME", "INCOME_WAGES", null],
  ["INCOME", "INCOME_OTHER_INCOME", null],
  ["TRANSFER_IN", "TRANSFER_IN_CASH_ADVANCES_AND_LOANS", null], ["TRANSFER_IN", "TRANSFER_IN_DEPOSIT", null],
  ["TRANSFER_IN", "TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS", null], ["TRANSFER_IN", "TRANSFER_IN_SAVINGS", null],
  ["TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER", null], ["TRANSFER_IN", "TRANSFER_IN_OTHER_TRANSFER_IN", null],
  ["TRANSFER_OUT", "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS", null], ["TRANSFER_OUT", "TRANSFER_OUT_SAVINGS", null],
  ["TRANSFER_OUT", "TRANSFER_OUT_WITHDRAWAL", null], ["TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER", null],
  ["TRANSFER_OUT", "TRANSFER_OUT_OTHER_TRANSFER_OUT", null],
  ["LOAN_PAYMENTS", "LOAN_PAYMENTS_CAR_PAYMENT", "transport"], ["LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", null],
  ["LOAN_PAYMENTS", "LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT", "other"], ["LOAN_PAYMENTS", "LOAN_PAYMENTS_MORTGAGE_PAYMENT", "housing"],
  ["LOAN_PAYMENTS", "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT", "other"], ["LOAN_PAYMENTS", "LOAN_PAYMENTS_OTHER_PAYMENT", "other"],
  ["BANK_FEES", "BANK_FEES_ATM_FEES", "other"], ["BANK_FEES", "BANK_FEES_FOREIGN_TRANSACTION_FEES", "other"],
  ["BANK_FEES", "BANK_FEES_INSUFFICIENT_FUNDS", "other"], ["BANK_FEES", "BANK_FEES_INTEREST_CHARGE", "other"],
  ["BANK_FEES", "BANK_FEES_OVERDRAFT_FEES", "other"], ["BANK_FEES", "BANK_FEES_OTHER_BANK_FEES", "other"],
  ["ENTERTAINMENT", "ENTERTAINMENT_CASINOS_AND_GAMBLING", "personal"], ["ENTERTAINMENT", "ENTERTAINMENT_MUSIC_AND_AUDIO", "personal"],
  ["ENTERTAINMENT", "ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS", "personal"],
  ["ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES", "personal"], ["ENTERTAINMENT", "ENTERTAINMENT_VIDEO_GAMES", "personal"],
  ["ENTERTAINMENT", "ENTERTAINMENT_OTHER_ENTERTAINMENT", "personal"],
  ["FOOD_AND_DRINK", "FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR", "food"], ["FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE", "food"],
  ["FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD", "food"], ["FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES", "food"],
  ["FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT", "food"], ["FOOD_AND_DRINK", "FOOD_AND_DRINK_VENDING_MACHINES", "food"],
  ["FOOD_AND_DRINK", "FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK", "food"],
  ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS", "education"],
  ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES", "personal"],
  ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_CONVENIENCE_STORES", "personal"],
  ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_DEPARTMENT_STORES", "personal"],
  ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_DISCOUNT_STORES", "personal"], ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ELECTRONICS", "personal"],
  ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES", "personal"], ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_OFFICE_SUPPLIES", "personal"],
  ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES", "personal"], ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_PET_SUPPLIES", "personal"],
  ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_SPORTING_GOODS", "personal"], ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_SUPERSTORES", "personal"],
  ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_TOBACCO_AND_VAPE", "personal"], ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE", "personal"],
  ["HOME_IMPROVEMENT", "HOME_IMPROVEMENT_FURNITURE", "housing"], ["HOME_IMPROVEMENT", "HOME_IMPROVEMENT_HARDWARE", "housing"],
  ["HOME_IMPROVEMENT", "HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE", "housing"], ["HOME_IMPROVEMENT", "HOME_IMPROVEMENT_SECURITY", "housing"],
  ["HOME_IMPROVEMENT", "HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT", "housing"],
  ["MEDICAL", "MEDICAL_DENTAL_CARE", "personal"], ["MEDICAL", "MEDICAL_EYE_CARE", "personal"], ["MEDICAL", "MEDICAL_NURSING_CARE", "personal"],
  ["MEDICAL", "MEDICAL_PHARMACIES_AND_SUPPLEMENTS", "personal"], ["MEDICAL", "MEDICAL_PRIMARY_CARE", "personal"],
  ["MEDICAL", "MEDICAL_VETERINARY_SERVICES", "personal"], ["MEDICAL", "MEDICAL_OTHER_MEDICAL", "personal"],
  ["PERSONAL_CARE", "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS", "personal"], ["PERSONAL_CARE", "PERSONAL_CARE_HAIR_AND_BEAUTY", "personal"],
  ["PERSONAL_CARE", "PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING", "personal"], ["PERSONAL_CARE", "PERSONAL_CARE_OTHER_PERSONAL_CARE", "personal"],
  ["GENERAL_SERVICES", "GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING", "other"], ["GENERAL_SERVICES", "GENERAL_SERVICES_AUTOMOTIVE", "transport"],
  ["GENERAL_SERVICES", "GENERAL_SERVICES_CHILDCARE", "other"], ["GENERAL_SERVICES", "GENERAL_SERVICES_CONSULTING_AND_LEGAL", "other"],
  ["GENERAL_SERVICES", "GENERAL_SERVICES_EDUCATION", "education"], ["GENERAL_SERVICES", "GENERAL_SERVICES_INSURANCE", "housing"],
  ["GENERAL_SERVICES", "GENERAL_SERVICES_POSTAGE_AND_SHIPPING", "other"], ["GENERAL_SERVICES", "GENERAL_SERVICES_STORAGE", "other"],
  ["GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES", "other"],
  ["GOVERNMENT_AND_NON_PROFIT", "GOVERNMENT_AND_NON_PROFIT_DONATIONS", "other"],
  ["GOVERNMENT_AND_NON_PROFIT", "GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES", "other"],
  ["GOVERNMENT_AND_NON_PROFIT", "GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT", "other"],
  ["GOVERNMENT_AND_NON_PROFIT", "GOVERNMENT_AND_NON_PROFIT_OTHER_GOVERNMENT_AND_NON_PROFIT", "other"],
  ["TRANSPORTATION", "TRANSPORTATION_BIKES_AND_SCOOTERS", "transport"], ["TRANSPORTATION", "TRANSPORTATION_GAS", "transport"],
  ["TRANSPORTATION", "TRANSPORTATION_PARKING", "transport"], ["TRANSPORTATION", "TRANSPORTATION_PUBLIC_TRANSIT", "transport"],
  ["TRANSPORTATION", "TRANSPORTATION_TAXIS_AND_RIDE_SHARES", "transport"], ["TRANSPORTATION", "TRANSPORTATION_TOLLS", "transport"],
  ["TRANSPORTATION", "TRANSPORTATION_OTHER_TRANSPORTATION", "transport"],
  ["TRAVEL", "TRAVEL_FLIGHTS", "transport"], ["TRAVEL", "TRAVEL_LODGING", "personal"], ["TRAVEL", "TRAVEL_RENTAL_CARS", "transport"],
  ["TRAVEL", "TRAVEL_OTHER_TRAVEL", "personal"],
  ["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY", "utilities"], ["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_INTERNET_AND_CABLE", "utilities"],
  ["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT", "housing"], ["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT", "utilities"],
  ["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_TELEPHONE", "utilities"], ["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_WATER", "utilities"],
  ["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_OTHER_UTILITIES", "utilities"],
  ["OTHER", "OTHER_OTHER", "other"],
];

test("every category Plaid can return maps to the right budget category", () => {
  assert.ok(taxonomy.length >= 100, `the list covers Plaid's whole taxonomy (${taxonomy.length} entries)`);
  check(taxonomy.map(([primary, detailed, expected]) => [NEUTRAL, 25, primary, detailed, expected] as Row));
});

test("Plaid's category beats whatever the merchant's name suggests", () => {
  // a name stuffed with keywords from other categories must not move a transaction Plaid is sure about
  const stuffed = "Pizza Gym Rent Electric Parking Tuition Salon";
  const decided = taxonomy.filter(([primary, detailed, expected]) => {
    if (primary === "OTHER" || primary === "GENERAL_SERVICES") return detailed in { GENERAL_SERVICES_AUTOMOTIVE: 1, GENERAL_SERVICES_EDUCATION: 1, GENERAL_SERVICES_INSURANCE: 1 } && expected !== "other";
    return true;
  });
  check(decided.map(([primary, detailed, expected]) => [stuffed, 25, primary, detailed, expected] as Row));
});

test("the broad category alone is enough", () => {
  check([
    [NEUTRAL, 25, "FOOD_AND_DRINK", undefined, "food"], [NEUTRAL, 25, "TRANSPORTATION", undefined, "transport"],
    [NEUTRAL, 25, "RENT_AND_UTILITIES", undefined, "utilities"], [NEUTRAL, 25, "HOME_IMPROVEMENT", undefined, "housing"],
    [NEUTRAL, 25, "ENTERTAINMENT", undefined, "personal"], [NEUTRAL, 25, "PERSONAL_CARE", undefined, "personal"],
    [NEUTRAL, 25, "MEDICAL", undefined, "personal"], [NEUTRAL, 25, "GENERAL_MERCHANDISE", undefined, "personal"],
    [NEUTRAL, 25, "TRAVEL", undefined, "personal"], [NEUTRAL, 25, "BANK_FEES", undefined, "other"],
    [NEUTRAL, 25, "GOVERNMENT_AND_NON_PROFIT", undefined, "other"], [NEUTRAL, 25, "LOAN_PAYMENTS", undefined, "other"],
    [NEUTRAL, 25, "GENERAL_SERVICES", undefined, "other"], [NEUTRAL, 25, "OTHER", undefined, "other"],
    [NEUTRAL, 25, "INCOME", undefined, null], [NEUTRAL, 25, "TRANSFER_IN", undefined, null], [NEUTRAL, 25, "TRANSFER_OUT", undefined, null],
  ]);
});

test("the detailed category alone is enough (the broad one is worked out from it)", () => {
  check(
    taxonomy.map(([, detailed, expected]) => [NEUTRAL, 25, undefined, detailed, expected] as Row),
  );
});

test("hints work in any letter case and with stray spaces", () => {
  check([
    [NEUTRAL, 25, "food_and_drink", "food_and_drink_coffee", "food"],
    [NEUTRAL, 25, "Food_And_Drink", undefined, "food"],
    [NEUTRAL, 25, " TRANSPORTATION ", " TRANSPORTATION_GAS ", "transport"],
    [NEUTRAL, 25, "income", "income_wages", null],
    [NEUTRAL, 25, "loan_payments", "loan_payments_credit_card_payment", null],
    [NEUTRAL, 25, "transfer_out", undefined, null],
  ]);
});

test("unknown or missing hints fall back to the name, then to Other", () => {
  check([
    [NEUTRAL, 25, "FOOD_AND_DRINK", "FOOD_AND_DRINK_SOMETHING_NEW", "food"], // known broad category, new detail
    [NEUTRAL, 25, "TRANSPORTATION", "TRANSPORTATION_HOVERBOARDS", "transport"],
    [NEUTRAL, 25, "BRAND_NEW_PRIMARY", "BRAND_NEW_PRIMARY_DETAIL", "other"], // nothing known: Other
    ["Corner Cafe", 6, "BRAND_NEW_PRIMARY", "BRAND_NEW_PRIMARY_DETAIL", "food"], // ...unless the name tells us
    [NEUTRAL, 25, "", "", "other"],
    [NEUTRAL, 25, null as unknown as string, null as unknown as string, "other"],
    ["Corner Cafe", 6, "", "", "food"],
  ]);
});

// ---------------------------------------------------------------------------------------------
// 2. Real-world merchants as a bank shows them (with the category Plaid would send)
// ---------------------------------------------------------------------------------------------
test("everyday merchants with Plaid's hints", () => {
  check([
    // food
    ["STARBUCKS #1234", 6.5, "FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE", "food"],
    ["McDonald's", 12, "FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD", "food"],
    ["CHIPOTLE MEXICAN GRILL 1234", 11, "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT", "food"],
    ["Whole Foods Market", 54, "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES", "food"],
    ["Food Lion", 143, "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES", "food"],
    ["Local Brewing Co", 18, "FOOD_AND_DRINK", "FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR", "food"],
    ["Uber Eats", 22, "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT", "food"],
    ["DoorDash*Sweetgreen", 17, "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT", "food"],
    ["Campus Vending", 2, "FOOD_AND_DRINK", "FOOD_AND_DRINK_VENDING_MACHINES", "food"],
    // transport
    ["Uber 063015 SF**POOL**", 14, "TRANSPORTATION", "TRANSPORTATION_TAXIS_AND_RIDE_SHARES", "transport"],
    ["Lyft *RIDE", 9, "TRANSPORTATION", "TRANSPORTATION_TAXIS_AND_RIDE_SHARES", "transport"],
    ["Chevron 0098", 41, "TRANSPORTATION", "TRANSPORTATION_GAS", "transport"],
    ["COSTCO GAS #1043", 52, "TRANSPORTATION", "TRANSPORTATION_GAS", "transport"],
    ["City Parking Garage", 8, "TRANSPORTATION", "TRANSPORTATION_PARKING", "transport"],
    ["NYC Subway MTA", 2.9, "TRANSPORTATION", "TRANSPORTATION_PUBLIC_TRANSIT", "transport"],
    ["E-ZPass NY", 25, "TRANSPORTATION", "TRANSPORTATION_TOLLS", "transport"],
    ["Lime Scooter", 4, "TRANSPORTATION", "TRANSPORTATION_BIKES_AND_SCOOTERS", "transport"],
    ["United Airlines", 380, "TRAVEL", "TRAVEL_FLIGHTS", "transport"],
    ["Hertz Rent A Car", 120, "TRAVEL", "TRAVEL_RENTAL_CARS", "transport"],
    ["Jiffy Lube", 70, "GENERAL_SERVICES", "GENERAL_SERVICES_AUTOMOTIVE", "transport"],
    ["Toyota Financial Services", 320, "LOAN_PAYMENTS", "LOAN_PAYMENTS_CAR_PAYMENT", "transport"],
    // utilities
    ["Comcast Cable", 70, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_INTERNET_AND_CABLE", "utilities"],
    ["Duke Energy", 88, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY", "utilities"],
    ["Verizon Wireless", 65, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_TELEPHONE", "utilities"],
    ["City Water Dept", 34, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_WATER", "utilities"],
    ["Waste Management", 29, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT", "utilities"],
    // housing
    ["Maple Street Apartments", 540, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT", "housing"],
    ["The Home Depot", 63, "HOME_IMPROVEMENT", "HOME_IMPROVEMENT_HARDWARE", "housing"],
    ["IKEA", 220, "HOME_IMPROVEMENT", "HOME_IMPROVEMENT_FURNITURE", "housing"],
    ["ADT Security", 45, "HOME_IMPROVEMENT", "HOME_IMPROVEMENT_SECURITY", "housing"],
    ["State Farm Insurance", 52, "GENERAL_SERVICES", "GENERAL_SERVICES_INSURANCE", "housing"],
    ["Wells Fargo Home Mortgage", 1450, "LOAN_PAYMENTS", "LOAN_PAYMENTS_MORTGAGE_PAYMENT", "housing"],
    // education
    ["Mathnasium", 658, "GENERAL_SERVICES", "GENERAL_SERVICES_EDUCATION", "education"],
    ["University Store", 58, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS", "education"],
    ["Barnes & Noble Education", 142, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS", "education"],
    // personal
    ["Netflix", 15.49, "ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES", "personal"],
    ["Spotify", 12.65, "ENTERTAINMENT", "ENTERTAINMENT_MUSIC_AND_AUDIO", "personal"],
    ["Steam Purchase", 29, "ENTERTAINMENT", "ENTERTAINMENT_VIDEO_GAMES", "personal"],
    ["Planet Fitness", 10, "PERSONAL_CARE", "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS", "personal"],
    ["Great Clips", 22, "PERSONAL_CARE", "PERSONAL_CARE_HAIR_AND_BEAUTY", "personal"],
    ["Spin Cycle Laundromat", 9, "PERSONAL_CARE", "PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING", "personal"],
    ["CVS/PHARMACY #4411", 18, "MEDICAL", "MEDICAL_PHARMACIES_AND_SUPPLEMENTS", "personal"],
    ["Target", 95, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_SUPERSTORES", "personal"],
    ["Amazon", 31, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES", "personal"],
    ["Best Buy", 249, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ELECTRONICS", "personal"],
    ["Hilton Hotels", 210, "TRAVEL", "TRAVEL_LODGING", "personal"],
    ["Apple", 16.99, "ENTERTAINMENT", "ENTERTAINMENT_OTHER_ENTERTAINMENT", "personal"],
    // other: things with no budget category of their own
    ["Interest charged", 20, "BANK_FEES", "BANK_FEES_INTEREST_CHARGE", "other"],
    ["Internal Revenue Service", 744, "GOVERNMENT_AND_NON_PROFIT", "GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT", "other"],
    ["Earnin", 58, "LOAN_PAYMENTS", "LOAN_PAYMENTS_EWA", "other"],
    ["Great Lakes Student Loans", 210, "LOAN_PAYMENTS", "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT", "other"],
    ["GoDaddy", 23, "GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES", "other"],
    ["OPENAI *CHATGPT SUBSCR", 20, "GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES", "other"],
    ["Red Cross", 25, "GOVERNMENT_AND_NON_PROFIT", "GOVERNMENT_AND_NON_PROFIT_DONATIONS", "other"],
  ]);
});

// ---------------------------------------------------------------------------------------------
// 3. Every brand and keyword the rules know, checked automatically
// ---------------------------------------------------------------------------------------------
const brandList = Object.entries(brandPhrases).flatMap(([category, list]) => list.map((phrase) => [phrase, category as Expected] as const));
const keywordList = Object.entries(fallbackPhrases).flatMap(([category, list]) => list.map((phrase) => [phrase, category as Expected] as const));

test("every well-known brand is recognised, however the bank prints it", () => {
  const rows: Row[] = [];
  for (const [phrase, category] of brandList) {
    const title = phrase.replace(/\b\w/g, (letter) => letter.toUpperCase());
    for (const name of [phrase, phrase.toUpperCase(), title, `${title} #1234`, `PURCHASE ${phrase.toUpperCase()} 5678 CA`, `${phrase}*store 9`, `  ${phrase}  `]) {
      rows.push([name, 15, undefined, undefined, category]);
    }
  }
  assert.ok(brandList.length > 100, `${brandList.length} brands`);
  check(rows);
});

test("every keyword phrase works on its own and inside a longer name", () => {
  const rows: Row[] = [];
  for (const [phrase, category] of keywordList) {
    for (const name of [phrase, phrase.toUpperCase(), `Zxqv ${phrase} Zxqv`, `The ${phrase} Co 4411`, `${phrase}!`]) {
      rows.push([name, 15, undefined, undefined, category]);
    }
  }
  assert.ok(keywordList.length > 70, `${keywordList.length} keyword phrases`);
  check(rows);
});

test("housing keyword 'rent' on its own works, but not as part of another phrase", () => {
  check([
    ["Rent", 540, undefined, undefined, "housing"],
    ["RENT", 540, undefined, undefined, "housing"],
    ["Apartment Rent", 540, undefined, undefined, "housing"],
    ["Rent Zxqv", 540, undefined, undefined, "housing"],
    ["Zxqv rent", 540, undefined, undefined, "housing"],
    ["Rent the Runway", 89, undefined, undefined, "other"],
    ["RENT THE RUNWAY", 89, undefined, undefined, "other"],
    ["Rent a Car", 89, undefined, undefined, "other"],
    ["Rent-A-Center", 60, undefined, undefined, "other"],
    ["Rental Car Return", 70, undefined, undefined, "other"],
    ["Rentals Unlimited", 70, undefined, undefined, "other"],
    ["Parent Teacher Store", 20, undefined, undefined, "other"],
    ["Current Account Fee", 5, undefined, undefined, "other"],
    ["Torrent Pizza", 14, undefined, undefined, "food"],
  ]);
});

test("a keyword hidden inside a longer word never counts", () => {
  const rows: Row[] = [];
  for (const [phrase] of [...brandList, ...keywordList]) {
    if (phrase.includes(" ")) continue; // single words: the 'zz' makes them part of a longer word
    rows.push([`zz${phrase}`, 15, undefined, undefined, "other"]);
    rows.push([`${phrase}zz`, 15, undefined, undefined, "other"]);
    rows.push([`zz${phrase}zz`, 15, undefined, undefined, "other"]);
  }
  check(rows);
});

// ---------------------------------------------------------------------------------------------
// 4. Look-alikes: names that contain a tempting word but mean something else
// ---------------------------------------------------------------------------------------------
test("look-alike words must not misfile a merchant (the 'water park' problem), with a hint", () => {
  check([
    ["Water Park Tickets", 40, "ENTERTAINMENT", "ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS", "personal"],
    ["Market Street Salon", 45, "PERSONAL_CARE", "PERSONAL_CARE_HAIR_AND_BEAUTY", "personal"],
    ["Delta Dental", 120, "MEDICAL", "MEDICAL_DENTAL_CARE", "personal"],
    ["Spectrum Health", 300, "MEDICAL", "MEDICAL_PRIMARY_CARE", "personal"],
    ["Verizon Center Tickets", 90, "ENTERTAINMENT", "ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS", "personal"],
    ["Rent the Runway", 89, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES", "personal"],
    ["Subway", 9, "FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD", "food"],
    ["Bird Rides", 5, "TRANSPORTATION", "TRANSPORTATION_BIKES_AND_SCOOTERS", "transport"],
    ["Steam Cleaning Pros", 80, "GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES", "other"],
    ["Peacock Alley Restaurant", 60, "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT", "food"],
    ["Paramount Plumbing", 150, "HOME_IMPROVEMENT", "HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE", "housing"],
    ["Pearson Dental Group", 90, "MEDICAL", "MEDICAL_DENTAL_CARE", "personal"],
    ["Equinox Cafe", 12, "FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE", "food"],
    ["Speedway Motorsports Tickets", 80, "ENTERTAINMENT", "ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS", "personal"],
  ]);
});

test("look-alike words must not misfile a merchant, with no hint at all", () => {
  check([
    // 'water'
    ["Water Park Tickets", 40, undefined, undefined, "other"],
    ["Watermark Church", 40, undefined, undefined, "other"],
    ["Watermelon Records", 20, undefined, undefined, "other"],
    ["Waterfront Grill", 30, undefined, undefined, "food"],
    ["Water Street Grill", 30, undefined, undefined, "food"],
    ["City Water Bill", 34, undefined, undefined, "utilities"],
    ["Sunrise Water Utility", 34, undefined, undefined, "utilities"],
    // 'market'
    ["Market Street Salon", 45, undefined, undefined, "personal"],
    ["Marketing Agency", 500, undefined, undefined, "other"],
    ["Farmers Market", 18, undefined, undefined, "food"],
    ["Flea Market", 18, undefined, undefined, "other"],
    // 'delta', 'subway', 'bird', 'lime', 'shell', 'spectrum', 'steam', 'verizon', 'speedway', 'paramount', 'peacock', 'pearson', 'equinox'
    ["Delta Dental", 120, undefined, undefined, "other"],
    ["Delta Faucet Supply", 120, undefined, undefined, "other"],
    ["Delta Air Lines", 300, undefined, undefined, "transport"],
    ["Subway", 9, undefined, undefined, "other"],
    ["Subway Sandwiches", 9, undefined, undefined, "other"],
    ["Bird Rides", 5, undefined, undefined, "other"],
    ["Bird & Co", 5, undefined, undefined, "other"],
    ["Lime Juice Co", 5, undefined, undefined, "other"],
    ["Lime Fresh Mexican Grill", 15, undefined, undefined, "food"],
    ["Shell Beach Cafe", 14, undefined, undefined, "food"],
    ["Shell Oil", 40, undefined, undefined, "transport"],
    ["Spectrum Health", 300, undefined, undefined, "other"],
    ["Spectrum Internet", 70, undefined, undefined, "utilities"],
    ["Steam Cleaning Services", 80, undefined, undefined, "other"],
    ["Steam Purchase", 29, undefined, undefined, "personal"],
    ["Verizon Center Tickets", 90, undefined, undefined, "other"],
    ["Verizon Wireless", 65, undefined, undefined, "utilities"],
    ["Speedway Motorsports", 80, undefined, undefined, "other"],
    ["Paramount Plumbing", 150, undefined, undefined, "other"],
    ["Paramount Plus", 12, undefined, undefined, "personal"],
    ["Peacock Alley", 60, undefined, undefined, "other"],
    ["Peacock TV", 6, undefined, undefined, "personal"],
    ["Pearson Dental Group", 90, undefined, undefined, "other"],
    ["Pearson Education", 90, undefined, undefined, "education"],
    ["Equinox Cafe", 12, undefined, undefined, "food"],
    ["Equinox Fitness", 200, undefined, undefined, "personal"],
    // names that merely contain a brand as part of a longer word
    ["Uberti Firearms", 600, undefined, undefined, "other"],
    ["Cavalier Dental", 90, undefined, undefined, "other"],
    ["Aldine Hardware", 40, undefined, undefined, "other"],
    ["Maturo Tailoring", 40, undefined, undefined, "other"],
    ["Kroger Road Tires", 40, undefined, undefined, "food"], // a brand word on its own is still the brand
    ["Culverts Inc", 40, undefined, undefined, "other"],
    // 'rent', 'park', 'school', 'college', 'gym', 'gas', 'toll', 'transit', 'taxi', 'coffee', 'cafe', 'salon', 'electric'
    ["Rent-A-Center", 60, undefined, undefined, "other"],
    ["Parkview Dental", 90, undefined, undefined, "other"],
    ["Park City Cafe", 12, undefined, undefined, "food"],
    ["Preschool Playhouse", 90, undefined, undefined, "other"],
    ["School Cafeteria", 6, undefined, undefined, "education"],
    ["Cafeteria Services", 6, undefined, undefined, "other"],
    ["College Pizza", 14, undefined, undefined, "food"],
    ["Community College Tuition", 900, undefined, undefined, "education"],
    ["Gymboree", 40, undefined, undefined, "other"],
    ["Gym Membership", 30, undefined, undefined, "personal"],
    ["Gas Light Pub", 30, undefined, undefined, "other"],
    ["Gas Station", 30, undefined, undefined, "transport"],
    ["Gas Company", 60, undefined, undefined, "utilities"],
    ["Toll Brothers", 5000, undefined, undefined, "other"],
    ["Toll Road Authority", 5, undefined, undefined, "transport"],
    ["Transitions Optical", 200, undefined, undefined, "other"],
    ["Transit Authority", 3, undefined, undefined, "transport"],
    ["Taxidermy Studio", 300, undefined, undefined, "other"],
    ["Coffeehouse Records", 20, undefined, undefined, "other"],
    ["Coffee House", 5, undefined, undefined, "food"],
    ["Decaf Depot", 5, undefined, undefined, "other"],
    ["Salonika Greek Restaurant", 25, undefined, undefined, "food"],
    ["Electrician Services", 180, undefined, undefined, "other"],
    ["Electric Avenue Bar and Grill", 40, undefined, undefined, "food"],
    ["Current Electric", 60, undefined, undefined, "utilities"],
    ["Fuel Fitness", 30, undefined, undefined, "personal"],
    ["Pharmacyone Billing", 30, undefined, undefined, "other"],
    ["Hoa Binh Restaurant", 25, undefined, undefined, "food"],
    ["Housing Authority", 540, undefined, undefined, "housing"],
  ]);
});

test("when a name matches several categories, the order is food, transport, utilities, housing, education, personal", () => {
  check([
    ["Pizza Gym", 14, undefined, undefined, "food"],
    ["Parking Pizza", 14, undefined, undefined, "food"],
    ["Parking Electric", 14, undefined, undefined, "transport"],
    ["Electric Apartment", 80, undefined, undefined, "utilities"],
    ["Apartment College", 80, undefined, undefined, "housing"],
    ["College Gym", 30, undefined, undefined, "education"],
    ["Internet Cafe", 8, undefined, undefined, "food"],
    ["Mortgage Pizza", 14, undefined, undefined, "food"],
  ]);
});

// ---------------------------------------------------------------------------------------------
// 5. How names are read: symbols, accents, case, payment-processor prefixes
// ---------------------------------------------------------------------------------------------
test("case, symbols and spacing do not matter", () => {
  check([
    ["starbucks", 6, undefined, undefined, "food"],
    ["STARBUCKS", 6, undefined, undefined, "food"],
    ["StArBuCkS", 6, undefined, undefined, "food"],
    ["Starbucks*Store 5", 6, undefined, undefined, "food"],
    ["STARBUCKS #1234 SEATTLE WA", 6, undefined, undefined, "food"],
    ["  Starbucks   ", 6, undefined, undefined, "food"],
    ["STARBUCKS\t#12\n", 6, undefined, undefined, "food"],
    ["Star bucks", 6, undefined, undefined, "other"],
    ["Starbuck", 6, undefined, undefined, "other"],
    ["chick-fil-a", 9, undefined, undefined, "food"],
    ["CHICK-FIL-A #02345", 9, undefined, undefined, "food"],
    ["Chick fil A", 9, undefined, undefined, "food"],
    ["In-N-Out Burger", 9, undefined, undefined, "food"],
    ["E-ZPASS", 9, undefined, undefined, "transport"],
    ["EZ Pass", 9, undefined, undefined, "transport"],
    ["T-Mobile", 70, undefined, undefined, "utilities"],
    ["PG&E", 90, undefined, undefined, "utilities"],
    ["Con-Edison", 90, undefined, undefined, "utilities"],
    ["H-E-B", 60, undefined, undefined, "food"],
  ]);
});

test("apostrophes of every kind are ignored", () => {
  check([
    ["McDonald's", 12, undefined, undefined, "food"],
    ["McDonald’s", 12, undefined, undefined, "food"],
    ["MCDONALDS #5", 12, undefined, undefined, "food"],
    ["Wendy's", 9, undefined, undefined, "food"],
    ["Domino’s Pizza", 17, undefined, undefined, "food"],
    ["Trader Joe's #301", 60, undefined, undefined, "food"],
    ["Papa John's", 20, undefined, undefined, "food"],
    ["Jimmy John's", 11, undefined, undefined, "food"],
    ["Jersey Mike's", 12, undefined, undefined, "food"],
    ["Culver's", 10, undefined, undefined, "food"],
  ]);
});

test("accents and unusual characters are handled", () => {
  check([
    ["CAFÉ RIO", 12, undefined, undefined, "food"],
    ["Café Rio", 12, undefined, undefined, "food"],
    ["Café Rio", 12, undefined, undefined, "food"], // accent as a separate character
    ["Crêperie Café", 12, undefined, undefined, "food"],
    ["Piñata Pizza", 14, undefined, undefined, "food"],
    ["☕ Coffee", 4, undefined, undefined, "food"],
    ["咖啡 Cafe", 4, undefined, undefined, "food"],
    ["\u{1F355} Pizza Place", 14, undefined, undefined, "food"],
    ["ÜBER TRIP", 14, undefined, undefined, "transport"], // an accent is ignored, so this is Uber
    ["กาแฟ", 4, undefined, undefined, "other"],
  ]);
});

test("payment-processor prefixes and billing descriptors", () => {
  check([
    ["SQ *CORNER CAFE", 6, undefined, undefined, "food"],
    ["SQ *Sunrise Bakery", 6, undefined, undefined, "food"],
    ["TST* Sunrise Bakery", 6, undefined, undefined, "food"],
    ["PAYPAL *NETFLIX", 15, undefined, undefined, "personal"],
    ["PP*SPOTIFY", 12, undefined, undefined, "personal"],
    ["GOOGLE *YouTube Premium", 14, undefined, undefined, "personal"],
    ["APPLE.COM/BILL", 3, undefined, undefined, "other"],
    ["AMZN Mktp US*2K4", 31, undefined, undefined, "other"],
    ["AMZN Mktp US*2K4", 31, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES", "personal"],
    ["POS DEBIT 0412 UBER TRIP", 14, undefined, undefined, "transport"],
    ["ACH WITHDRAWAL COMCAST", 70, undefined, undefined, "utilities"],
    ["CHECKCARD 0914 WALGREENS #442 PORTLAND OR", 18, undefined, undefined, "personal"],
  ]);
});

test("the bank's name and Plaid's cleaned-up merchant name are both used", () => {
  check([
    ["SBX #12 XXXX", 6, undefined, undefined, "food", "Starbucks"],
    ["Starbucks", 6, undefined, undefined, "food", null as unknown as string],
    ["Starbucks", 6, undefined, undefined, "food", undefined],
    [NEUTRAL, 6, undefined, undefined, "food", "Corner Cafe"],
    ["Pizza Place", 14, undefined, undefined, "food", NEUTRAL],
    ["UBER *EATS PENDING", 22, undefined, undefined, "food", "Uber Eats"],
    ["UBER TRIP", 14, undefined, undefined, "transport", "Uber"],
    [NEUTRAL, 6, undefined, undefined, "other", NEUTRAL],
    ["", 6, undefined, undefined, "food", "Starbucks"],
    ["Starbucks", 6, undefined, undefined, "food", ""],
  ]);
});

test("odd and extreme names never break the sorting", () => {
  check([
    ["", 5, undefined, undefined, "other"],
    ["   ", 5, undefined, undefined, "other"],
    ["12345", 5, undefined, undefined, "other"],
    ["!!!???***", 5, undefined, undefined, "other"],
    ["(.*) [a-z]+ \\ $^ |", 5, undefined, undefined, "other"],
    ["Pizza (.*) [", 5, undefined, undefined, "food"],
    ["a".repeat(5000), 5, undefined, undefined, "other"],
    [`${"x ".repeat(2000)}pizza`, 5, undefined, undefined, "food"],
    ["line one\nline two\r\npizza\ttab", 5, undefined, undefined, "food"],
    ["\u0000\u0001 pizza \u0007", 5, undefined, undefined, "food"],
  ]);
});

test("very long input is sorted quickly (no pathological pattern matching)", () => {
  const start = performance.now();
  for (const name of ["a".repeat(200_000), "pizza ".repeat(40_000), `${"water ".repeat(30_000)}park`, "rent ".repeat(40_000)]) {
    categorizeTransaction({ name, amount: 5 });
  }
  assert.ok(performance.now() - start < 1500, `took ${Math.round(performance.now() - start)} ms`);
});

test("random garbage never throws and always gives a valid answer", () => {
  let seed = 12345;
  const next = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const alphabet = "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_*#&'.,/\\()[]{}|^$+?éü中\u{1F600}\n\t";
  const valid = new Set<string | null>([...categoryIds, null]);
  for (let index = 0; index < 4000; index += 1) {
    const length = Math.floor(next() * 60);
    let name = "";
    for (let character = 0; character < length; character += 1) name += alphabet[Math.floor(next() * alphabet.length)];
    const amount = (next() - 0.3) * 200;
    const result = categorizeTransaction({ name, amount, primaryCategory: next() < 0.3 ? "FOOD_AND_DRINK" : undefined });
    assert.ok(valid.has(result), `${JSON.stringify(name)} gave ${result}`);
    if (!(amount > 0)) assert.equal(result, null, `${amount} is not spending`);
  }
});

// ---------------------------------------------------------------------------------------------
// 6. What counts as spending at all, and which source wins when they disagree
// ---------------------------------------------------------------------------------------------
test("things that are not spending are skipped", () => {
  check([
    ["Sweetgreen inc payroll ppd id", -810, "INCOME", "INCOME_WAGES", null],
    ["Payroll that arrived as a positive number", 810, "INCOME", "INCOME_WAGES", null],
    ["Refund from Target", -12, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_SUPERSTORES", null],
    ["Refund with no hint", -12, undefined, undefined, null],
    ["Transfer to savings", 100, "TRANSFER_OUT", "TRANSFER_OUT_SAVINGS", null],
    ["Transfer from checking", 100, "TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER", null],
    ["Starbucks", 100, "TRANSFER_OUT", "TRANSFER_OUT_ACCOUNT_TRANSFER", null],
    ["Venmo cashout", 50, "TRANSFER_IN", "TRANSFER_IN_DEPOSIT", null],
    ["Payment Thank You", 300, "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", null],
    ["Payment Thank You", 300, undefined, "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", null],
    ["Zero dollar check", 0, undefined, undefined, null],
    ["Negative zero", -0, "FOOD_AND_DRINK", undefined, null],
    ["Tiny refund", -0.01, "FOOD_AND_DRINK", undefined, null],
  ]);
});

test("amounts: tiny and huge spending counts, nonsense does not", () => {
  check([
    ["Cafe", 0.01, undefined, undefined, "food"],
    ["Cafe", 0.001, undefined, undefined, "food"],
    ["Cafe", 999_999_999, undefined, undefined, "food"],
    ["Cafe", Number.MAX_VALUE, undefined, undefined, "food"],
    ["Cafe", Number.NaN, undefined, undefined, null],
    ["Cafe", Number.POSITIVE_INFINITY, undefined, undefined, null],
    ["Cafe", Number.NEGATIVE_INFINITY, undefined, undefined, null],
    ["Cafe", undefined as unknown as number, undefined, undefined, null],
    ["Cafe", null as unknown as number, undefined, undefined, null],
    ["Cafe", "5" as unknown as number, undefined, undefined, null], // amounts are always numbers; text is rejected
  ]);
});

test("Plaid's category outranks a brand; fees, loans, taxes and donations ignore keywords entirely", () => {
  check([
    // Plaid knows best
    ["Uber Eats", 22, "TRANSPORTATION", "TRANSPORTATION_TAXIS_AND_RIDE_SHARES", "transport"],
    ["Starbucks", 6, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_SUPERSTORES", "personal"],
    ["Netflix", 15, "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT", "food"],
    // a brand fills the gap when Plaid cannot say
    ["Comcast", 70, "GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES", "utilities"],
    ["Netflix", 15, "OTHER", "OTHER_OTHER", "personal"],
    ["Starbucks", 6, "", "", "food"],
    ["Chevron Food Mart", 9, undefined, undefined, "transport"],
    ["Chevron Food Mart", 9, "FOOD_AND_DRINK", "FOOD_AND_DRINK_CONVENIENCE", "food"],
    // these categories are final
    ["ATM Fee at Corner Cafe", 3, "BANK_FEES", "BANK_FEES_ATM_FEES", "other"],
    ["Starbucks Interest Charge", 3, "BANK_FEES", "BANK_FEES_INTEREST_CHARGE", "other"],
    ["Parking Ticket City Hall", 40, "GOVERNMENT_AND_NON_PROFIT", "GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES", "other"],
    ["Netflix", 15, "LOAN_PAYMENTS", "LOAN_PAYMENTS_OTHER_PAYMENT", "other"],
    ["University Tuition Plan", 500, "LOAN_PAYMENTS", "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT", "other"],
    ["Pizza Mortgage", 900, "LOAN_PAYMENTS", "LOAN_PAYMENTS_MORTGAGE_PAYMENT", "housing"],
    ["Food Bank Donation", 20, "GOVERNMENT_AND_NON_PROFIT", "GOVERNMENT_AND_NON_PROFIT_DONATIONS", "other"],
  ]);
});

test("how much the golden list covers", () => {
  console.log(`golden list: ${casesChecked} individual merchant cases checked`);
  assert.ok(casesChecked > 1500, `${casesChecked} cases`);
});
