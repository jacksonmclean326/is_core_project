/**
 * Currencies a user can show amounts in. This only changes the symbol and number format: nothing is
 * converted, so a $500 budget shown in euros reads as €500. Used by both the server and the browser.
 */

export interface CurrencyOption {
  code: string;
  name: string;
}

export const defaultCurrency = "USD";

export const currencies: readonly CurrencyOption[] = [
  { code: "USD", name: "US dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British pound" },
  { code: "CAD", name: "Canadian dollar" },
  { code: "AUD", name: "Australian dollar" },
  { code: "NZD", name: "New Zealand dollar" },
  { code: "MXN", name: "Mexican peso" },
  { code: "BRL", name: "Brazilian real" },
  { code: "JPY", name: "Japanese yen" },
  { code: "CNY", name: "Chinese yuan" },
  { code: "KRW", name: "South Korean won" },
  { code: "INR", name: "Indian rupee" },
  { code: "CHF", name: "Swiss franc" },
  { code: "SEK", name: "Swedish krona" },
  { code: "SGD", name: "Singapore dollar" },
];

export function isCurrencyCode(value: unknown): value is string {
  return typeof value === "string" && currencies.some((currency) => currency.code === value);
}

/** The user's saved currency, or USD when none is saved or the saved value is not in the list. */
export function currencyOrDefault(value: unknown): string {
  return isCurrencyCode(value) ? value : defaultCurrency;
}

export function createMoneyFormatter(code: string, maximumFractionDigits = 0): Intl.NumberFormat {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyOrDefault(code),
    maximumFractionDigits,
  });
}

/** "$", "€", "£" and so on, for the symbol shown beside an amount box. */
export function currencySymbol(code: string): string {
  return (
    createMoneyFormatter(code, 0)
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? code
  );
}
