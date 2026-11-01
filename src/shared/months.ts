// Calendar-month helpers shared by the browser and the server.
// Everything works on "YYYY-MM" month keys and "YYYY-MM-DD" date strings so that
// results never depend on the machine's time zone or on Date parsing quirks.

export type MonthKey = string;

/** How far back Plaid can serve transactions. */
export const transactionHistoryMonths = 24;

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const monthKeyPattern = /^(\d{4})-(0[1-9]|1[0-2])$/;
const datePattern = /^(\d{4})-(0[1-9]|1[0-2])-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Invalid month: ${year}-${month}`);
  }
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === "string" && monthKeyPattern.test(value);
}

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = datePattern.exec(value);
  if (!match) return false;
  const day = Number(match[3]);
  return day >= 1 && day <= daysInMonth(Number(match[1]), Number(match[2]));
}

export function parseMonthKey(key: MonthKey): { year: number; month: number } {
  const match = monthKeyPattern.exec(key);
  if (!match) throw new RangeError(`Invalid month key: ${key}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function makeMonthKey(year: number, month: number): MonthKey {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** Month containing a "YYYY-MM-DD" date (a longer ISO timestamp is accepted too). */
export function monthKeyOfDate(date: string): MonthKey {
  const key = date.slice(0, 7);
  if (!isMonthKey(key)) throw new RangeError(`Invalid date: ${date}`);
  return key;
}

/** Today's month, by the given clock's local calendar (pass `new Date()`). */
export function currentMonthKey(now: Date = new Date()): MonthKey {
  return makeMonthKey(now.getFullYear(), now.getMonth() + 1);
}

export function localDateString(now: Date = new Date()): string {
  return `${currentMonthKey(now)}-${String(now.getDate()).padStart(2, "0")}`;
}

export function utcDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The date `days` after (or before, if negative) a "YYYY-MM-DD" date. */
export function addDays(date: string, days: number): string {
  if (!isDateString(date)) throw new RangeError(`Invalid date: ${date}`);
  const moved = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + days));
  return moved.toISOString().slice(0, 10);
}

export function addMonths(key: MonthKey, delta: number): MonthKey {
  const { year, month } = parseMonthKey(key);
  const index = year * 12 + (month - 1) + delta;
  return makeMonthKey(Math.floor(index / 12), (((index % 12) + 12) % 12) + 1);
}

export function compareMonths(first: MonthKey, second: MonthKey): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

/** The `count` months ending at (and including) `end`, oldest first. */
export function monthRange(end: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => addMonths(end, index - count + 1));
}

export function monthStart(key: MonthKey): string {
  return `${key}-01`;
}

export function monthEnd(key: MonthKey): string {
  const { year, month } = parseMonthKey(key);
  return `${key}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
}

export function monthName(key: MonthKey): string {
  return monthNames[parseMonthKey(key).month - 1] ?? "";
}

export function shortMonthName(key: MonthKey): string {
  return monthName(key).slice(0, 3);
}

/** "October 2026" */
export function monthLabel(key: MonthKey): string {
  return `${monthName(key)} ${parseMonthKey(key).year}`;
}

/** "Oct 5" for a YYYY-MM-DD date. */
export function shortDateLabel(date: string): string {
  if (!isDateString(date)) return date;
  return `${shortMonthName(monthKeyOfDate(date))} ${Number(date.slice(8, 10))}`;
}

export function weekdayOf(date: string): string {
  if (!isDateString(date)) throw new RangeError(`Invalid date: ${date}`);
  const [year, month, day] = [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))];
  // Sakamoto's algorithm: no Date object, so no time-zone effects.
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const adjustedYear = month < 3 ? year - 1 : year;
  const index =
    (adjustedYear + Math.floor(adjustedYear / 4) - Math.floor(adjustedYear / 100) + Math.floor(adjustedYear / 400) +
      (offsets[month - 1] ?? 0) + day) % 7;
  return weekdayNames[index] ?? "";
}

/** "THURSDAY, OCTOBER 2" */
export function fullDateEyebrow(date: string): string {
  return `${weekdayOf(date)}, ${monthName(monthKeyOfDate(date))} ${Number(date.slice(8, 10))}`.toUpperCase();
}

/**
 * Inclusive date range to read for a month. The current month stops at `today`
 * (no transactions exist later); a future month yields null.
 */
export function dateRangeForMonth(key: MonthKey, today: string): { start: string; end: string } | null {
  const start = monthStart(key);
  if (start > today) return null;
  const end = monthEnd(key);
  return { start, end: end < today ? end : today };
}
