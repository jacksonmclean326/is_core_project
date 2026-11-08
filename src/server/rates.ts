import { currencies, defaultCurrency } from "../shared/currencies.js";

/**
 * Exchange rates for the display currency. Everything in the database is stored in US dollars; a rate is
 * "how many units of that currency one US dollar buys". Rates come from the European Central Bank through
 * Frankfurter (free, no key), are cached in memory for six hours, and an older copy is used if the service
 * cannot be reached. They are daily reference rates, not what a bank would charge.
 */

export interface RatesSnapshot {
  base: "USD";
  /** The date the rates were published (YYYY-MM-DD). */
  date: string;
  rates: Record<string, number>;
  /** When this server fetched them (ms since epoch). */
  fetchedAt: number;
}

const ttlMs = 6 * 60 * 60 * 1000;
const symbols = currencies
  .map((currency) => currency.code)
  .filter((code) => code !== defaultCurrency)
  .join(",");

let cache: RatesSnapshot | null = null;
let inflight: Promise<RatesSnapshot | null> | null = null;

async function fetchRates(): Promise<RatesSnapshot> {
  const response = await fetch(`https://api.frankfurter.dev/v1/latest?base=${defaultCurrency}&symbols=${symbols}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Exchange rate service answered ${response.status}.`);
  const data: unknown = await response.json();
  if (typeof data !== "object" || data === null) throw new Error("Unexpected exchange rate response.");
  const { date, rates } = data as { date?: unknown; rates?: unknown };
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof rates !== "object" || rates === null) {
    throw new Error("Unexpected exchange rate response.");
  }
  const clean: Record<string, number> = { [defaultCurrency]: 1 };
  for (const code of symbols.split(",")) {
    const value = (rates as Record<string, unknown>)[code];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`Exchange rate for ${code} is missing.`);
    }
    clean[code] = value;
  }
  return { base: "USD", date, rates: clean, fetchedAt: Date.now() };
}

/** Current rates, or the last good copy if the service is down, or null if there has never been one. */
export async function getRates(): Promise<RatesSnapshot | null> {
  if (cache && Date.now() - cache.fetchedAt < ttlMs) return cache;
  inflight ??= fetchRates()
    .then((snapshot) => {
      cache = snapshot;
      return snapshot;
    })
    .catch((error: unknown) => {
      console.error("Could not fetch exchange rates.", error);
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Units of `code` per US dollar, or null if it is not known. USD is always 1. */
export async function rateFor(code: string): Promise<number | null> {
  if (code === defaultCurrency) return 1;
  const snapshot = await getRates();
  return snapshot?.rates[code] ?? null;
}
