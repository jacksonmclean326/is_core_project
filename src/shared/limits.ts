// Category spending limits: reading what the user typed, and working out how close spending is.

export const maxLimit = 1_000_000;

export type LimitInput = { ok: true; value: number } | { ok: false; message: string };

/**
 * Reads a limit the user typed. Blank means "no limit" (0). Accepts "300", "$300", "1,200", "75.50".
 */
export function parseLimit(text: string): LimitInput {
  const cleaned = text.trim().replace(/[$,\s]/g, "");
  if (cleaned === "") return { ok: true, value: 0 };
  if (cleaned.startsWith("-")) return { ok: false, message: "A limit cannot be negative. Leave it blank for no limit." };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { ok: false, message: "Enter a limit like 300 or 75.50, or leave it blank for no limit." };
  const value = Math.round(Number(cleaned) * 100) / 100;
  if (value > maxLimit) return { ok: false, message: "That limit is too large." };
  return { ok: true, value };
}

export type LimitStatus = "none" | "within" | "close" | "reached";

/** "close" starts at 90% of the limit, "reached" at 100%. A limit of 0 means no limit. */
export function limitStatus(spent: number, limit: number): LimitStatus {
  if (!(limit > 0)) return "none";
  const used = spent / limit;
  if (used >= 1) return "reached";
  if (used >= 0.9) return "close";
  return "within";
}

/** The sum of all limits that are set, in whole cents so the total is exact. */
export function totalLimits(limits: number[]): number {
  return limits.reduce((sum, limit) => sum + (limit > 0 ? Math.round(limit * 100) : 0), 0) / 100;
}

/**
 * Scales every limit that is set when the monthly budget changes from `previous` to `next`, keeping
 * their proportions. If there was no previous budget, or it did not change, limits are left alone.
 */
export function scaleLimits(limits: number[], previous: number, next: number): number[] {
  if (!(previous > 0) || !(next > 0) || previous === next) return limits;
  return limits.map((limit) => (limit > 0 ? Math.max(1, Math.round((limit * next) / previous)) : limit));
}
