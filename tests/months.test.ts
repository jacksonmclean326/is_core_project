import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  addMonths,
  compareMonths,
  currentMonthKey,
  dateRangeForMonth,
  daysInMonth,
  fullDateEyebrow,
  isDateString,
  isLeapYear,
  isMonthKey,
  localDateString,
  makeMonthKey,
  monthEnd,
  monthKeyOfDate,
  monthLabel,
  monthName,
  monthRange,
  monthStart,
  parseMonthKey,
  shortDateLabel,
  shortMonthName,
  utcDateString,
  weekdayOf,
} from "../src/shared/months.ts";

test("leap years follow the Gregorian rule", () => {
  for (const year of [2000, 2004, 2024, 2028, 2400]) assert.equal(isLeapYear(year), true, String(year));
  for (const year of [1900, 2100, 2200, 2023, 2025, 2026, 2027]) assert.equal(isLeapYear(year), false, String(year));
});

test("daysInMonth is right for every month, including leap Februaries", () => {
  const regular = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  regular.forEach((days, index) => assert.equal(daysInMonth(2026, index + 1), days, `2026-${index + 1}`));
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2000, 2), 29);
  assert.equal(daysInMonth(1900, 2), 28);
  assert.equal(daysInMonth(2100, 2), 28);
  assert.throws(() => daysInMonth(2026, 0), RangeError);
  assert.throws(() => daysInMonth(2026, 13), RangeError);
  assert.throws(() => daysInMonth(2026, 1.5), RangeError);
});

test("month key and date validation", () => {
  for (const good of ["2026-01", "2026-12", "0999-05", "2099-10"]) assert.equal(isMonthKey(good), true, good);
  for (const bad of ["2026-00", "2026-13", "26-10", "2026-1", "2026-10-01", "2026/10", "", "abcd-ef", null, 202610, undefined]) {
    assert.equal(isMonthKey(bad), false, String(bad));
  }
  for (const good of ["2026-10-31", "2028-02-29", "2026-02-28", "2026-04-30", "2000-02-29"]) assert.equal(isDateString(good), true, good);
  for (const bad of ["2026-02-29", "2026-04-31", "2026-10-32", "2026-10-00", "2100-02-29", "2026-1-5", "2026-10", "", null]) {
    assert.equal(isDateString(bad), false, String(bad));
  }
});

test("parse and make round-trip", () => {
  assert.deepEqual(parseMonthKey("2026-10"), { year: 2026, month: 10 });
  assert.equal(makeMonthKey(2026, 3), "2026-03");
  assert.equal(makeMonthKey(999, 5), "0999-05");
  assert.throws(() => parseMonthKey("2026-13"), RangeError);
  assert.equal(monthKeyOfDate("2026-10-31"), "2026-10");
  assert.equal(monthKeyOfDate("2026-11-01T00:00:00Z"), "2026-11");
  assert.throws(() => monthKeyOfDate("garbage"), RangeError);
});

test("addMonths crosses year boundaries in both directions", () => {
  assert.equal(addMonths("2026-10", 0), "2026-10");
  assert.equal(addMonths("2026-10", 1), "2026-11");
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2027-01", -1), "2026-12");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(addMonths("2026-10", 3), "2027-01");
  assert.equal(addMonths("2026-10", 15), "2028-01");
  assert.equal(addMonths("2026-10", -10), "2025-12");
  assert.equal(addMonths("2026-10", -24), "2024-10");
  assert.equal(addMonths("2026-12", 12), "2027-12");
  assert.equal(addMonths("2026-12", -12), "2025-12");
  assert.equal(addMonths("2026-12", -11), "2026-01");
  assert.equal(addMonths("2026-01", -12), "2025-01");
  assert.equal(addMonths("2026-01", -13), "2024-12");
});

test("addMonths is reversible for a wide span of months", () => {
  for (const start of ["2024-01", "2024-02", "2026-06", "2026-12", "2028-02"]) {
    for (let delta = -60; delta <= 60; delta += 1) {
      assert.equal(addMonths(addMonths(start, delta), -delta), start, `${start} ${delta}`);
    }
  }
});

test("monthRange returns consecutive months, oldest first", () => {
  assert.deepEqual(monthRange("2026-10", 6), ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(monthRange("2027-02", 6), ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(monthRange("2026-03", 1), ["2026-03"]);
  assert.deepEqual(monthRange("2026-03", 0), []);
  assert.deepEqual(monthRange("2026-03", -3), []);
  const year = monthRange("2026-12", 13);
  assert.equal(year.length, 13);
  assert.equal(year[0], "2025-12");
  assert.equal(new Set(year).size, 13);
});

test("compareMonths orders chronologically across years", () => {
  assert.equal(compareMonths("2025-12", "2026-01"), -1);
  assert.equal(compareMonths("2026-01", "2025-12"), 1);
  assert.equal(compareMonths("2026-05", "2026-05"), 0);
  assert.equal(compareMonths("2026-09", "2026-10"), -1);
});

test("month start and end dates", () => {
  assert.equal(monthStart("2026-10"), "2026-10-01");
  assert.equal(monthEnd("2026-10"), "2026-10-31");
  assert.equal(monthEnd("2026-11"), "2026-11-30");
  assert.equal(monthEnd("2026-02"), "2026-02-28");
  assert.equal(monthEnd("2028-02"), "2028-02-29");
  assert.equal(monthEnd("2100-02"), "2100-02-28");
  assert.equal(monthEnd("2026-12"), "2026-12-31");
  for (let month = 1; month <= 12; month += 1) {
    assert.equal(isDateString(monthEnd(makeMonthKey(2026, month))), true);
  }
});

test("labels", () => {
  assert.equal(monthName("2026-01"), "January");
  assert.equal(monthName("2026-12"), "December");
  assert.equal(shortMonthName("2026-09"), "Sep");
  assert.equal(monthLabel("2027-01"), "January 2027");
  assert.equal(shortDateLabel("2026-10-05"), "Oct 5");
  assert.equal(shortDateLabel("2026-12-31"), "Dec 31");
  assert.equal(shortDateLabel("nonsense"), "nonsense");
});

test("weekdays match known calendar dates", () => {
  const known: Record<string, string> = {
    "2026-10-02": "Friday",
    "2026-11-01": "Sunday",
    "2026-01-01": "Thursday",
    "2026-12-31": "Thursday",
    "2024-02-29": "Thursday",
    "2028-02-29": "Tuesday",
    "2000-01-01": "Saturday",
    "1999-12-31": "Friday",
    "2100-03-01": "Monday",
    "2026-03-01": "Sunday",
    "2026-02-28": "Saturday",
  };
  for (const [date, weekday] of Object.entries(known)) assert.equal(weekdayOf(date), weekday, date);
  assert.throws(() => weekdayOf("2026-02-30"), RangeError);
});

test("weekdayOf agrees with the built-in calendar for every day across several years", () => {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  for (let time = Date.UTC(2023, 0, 1); time < Date.UTC(2030, 0, 1); time += 86_400_000) {
    const date = new Date(time).toISOString().slice(0, 10);
    assert.equal(weekdayOf(date), names[new Date(time).getUTCDay()], date);
  }
});

test("full date eyebrow", () => {
  assert.equal(fullDateEyebrow("2026-10-02"), "FRIDAY, OCTOBER 2");
  assert.equal(fullDateEyebrow("2028-02-29"), "TUESDAY, FEBRUARY 29");
  assert.equal(fullDateEyebrow("2027-01-01"), "FRIDAY, JANUARY 1");
});

test("date range for a month stops at today and never reaches the future", () => {
  assert.deepEqual(dateRangeForMonth("2026-09", "2026-10-15"), { start: "2026-09-01", end: "2026-09-30" });
  assert.deepEqual(dateRangeForMonth("2026-10", "2026-10-15"), { start: "2026-10-01", end: "2026-10-15" });
  assert.deepEqual(dateRangeForMonth("2026-10", "2026-10-31"), { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(dateRangeForMonth("2026-10", "2026-10-01"), { start: "2026-10-01", end: "2026-10-01" });
  assert.deepEqual(dateRangeForMonth("2026-02", "2026-03-01"), { start: "2026-02-01", end: "2026-02-28" });
  assert.deepEqual(dateRangeForMonth("2028-02", "2028-03-01"), { start: "2028-02-01", end: "2028-02-29" });
  assert.deepEqual(dateRangeForMonth("2025-12", "2026-01-01"), { start: "2025-12-01", end: "2025-12-31" });
  assert.equal(dateRangeForMonth("2026-11", "2026-10-31"), null);
  assert.equal(dateRangeForMonth("2027-01", "2026-12-31"), null);
});

test("the clock helpers use the right calendar", () => {
  const lateNewYearsEve = new Date(2026, 11, 31, 23, 59, 59);
  assert.equal(currentMonthKey(lateNewYearsEve), "2026-12");
  assert.equal(localDateString(lateNewYearsEve), "2026-12-31");
  const firstMoment = new Date(2027, 0, 1, 0, 0, 0);
  assert.equal(currentMonthKey(firstMoment), "2027-01");
  assert.equal(localDateString(firstMoment), "2027-01-01");
  const leapDay = new Date(2028, 1, 29, 12);
  assert.equal(localDateString(leapDay), "2028-02-29");
  assert.equal(utcDateString(new Date(Date.UTC(2026, 9, 31, 23, 59))), "2026-10-31");
  assert.equal(utcDateString(new Date(Date.UTC(2026, 10, 1, 0, 0))), "2026-11-01");
});

test("addDays moves across month ends, year ends and leap days", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2027-01-01", -1), "2026-12-31");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2028-02-29", 1), "2028-03-01");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2026-10-15", 0), "2026-10-15");
  assert.equal(addDays("2026-10-15", 30), "2026-11-14");
  assert.equal(addDays("2026-10-15", -365), "2025-10-15");
  assert.throws(() => addDays("2026-02-30", 1), RangeError);
});
