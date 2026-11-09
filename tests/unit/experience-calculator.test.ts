import { describe, it, expect } from "vitest";
import {
  clampFrom,
  durationOf,
  entryToRange,
  graduationMonthStart,
  mergeRanges,
  toYmd,
  ymdToDay,
} from "../../src/modules/employee-work-history/experienceCalculator";

const range = (start: string, end: string) => ({ start: ymdToDay(start), end: ymdToDay(end) });

describe("toYmd", () => {
  it("keeps the calendar part of date strings and ISO timestamps", () => {
    expect(toYmd("2020-03-05")).toBe("2020-03-05");
    expect(toYmd("2020-03-05T18:30:00.000Z")).toBe("2020-03-05");
  });
  it("uses local calendar parts for Date objects", () => {
    expect(toYmd(new Date(2020, 2, 5))).toBe("2020-03-05");
  });
  it("returns null for junk", () => {
    expect(toYmd(null)).toBeNull();
    expect(toYmd("not a date")).toBeNull();
  });
});

describe("durationOf", () => {
  it("is exactly 2 years for 2018-01-01 -> 2020-01-01", () => {
    expect(durationOf([range("2018-01-01", "2020-01-01")])).toMatchObject({ years: 2, months: 0, days: 0 });
  });

  it("reports years, months and days", () => {
    expect(durationOf([range("2019-03-10", "2021-07-25")])).toMatchObject({ years: 2, months: 4, days: 15 });
  });

  it("handles month-end starts without losing or inventing days", () => {
    // Jan 31 + 1 month clamps to Feb 28 (non-leap)
    expect(durationOf([range("2021-01-31", "2021-03-01")])).toMatchObject({ years: 0, months: 1, days: 1 });
  });

  it("counts overlapping roles once", () => {
    const d = durationOf([range("2018-01-01", "2019-01-01"), range("2018-07-01", "2019-07-01")]);
    expect(d).toMatchObject({ years: 1, months: 6, days: 0 });
  });

  it("does not count career breaks between roles", () => {
    const d = durationOf([range("2018-01-01", "2019-01-01"), range("2020-01-01", "2021-01-01")]);
    expect(d).toMatchObject({ years: 2, months: 0, days: 0 });
  });

  it("merges back-to-back roles", () => {
    expect(mergeRanges([range("2018-01-01", "2019-01-01"), range("2019-01-01", "2020-01-01")])).toHaveLength(1);
  });

  it("returns zero for no ranges", () => {
    expect(durationOf([])).toEqual({ years: 0, months: 0, days: 0, totalDays: 0 });
  });
});

describe("clampFrom", () => {
  it("trims a range that straddles the cut-off and drops ones fully before it", () => {
    const out = clampFrom([range("2018-06-01", "2020-06-01"), range("2015-01-01", "2016-01-01")], ymdToDay("2019-06-01"));
    expect(out).toHaveLength(1);
    expect(durationOf(out)).toMatchObject({ years: 1, months: 0, days: 0 });
  });
});

describe("entryToRange", () => {
  const today = ymdToDay("2024-01-01");
  it("treats a missing end date as ongoing up to today", () => {
    expect(entryToRange({ startDate: "2023-01-01", endDate: null }, today)).toEqual(range("2023-01-01", "2024-01-01"));
  });
  it("skips reversed or empty ranges and unparsable dates", () => {
    expect(entryToRange({ startDate: "2021-01-01", endDate: "2020-01-01" }, today)).toBeNull();
    expect(entryToRange({ startDate: "2021-01-01", endDate: "2021-01-01" }, today)).toBeNull();
    expect(entryToRange({ startDate: "garbage" }, today)).toBeNull();
  });
});

describe("graduationMonthStart", () => {
  it("collapses a graduation date to the first day of its month", () => {
    expect(graduationMonthStart("2019-06-23")).toBe("2019-06-01");
    expect(graduationMonthStart(null)).toBeNull();
  });
});
