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
  it("treats a missing end date as ongoing, counting today as a day worked", () => {
    expect(entryToRange({ startDate: "2023-01-01", endDate: null }, today)).toEqual(range("2023-01-01", "2024-01-02"));
  });
  it("counts the end date as a day worked (inclusive)", () => {
    expect(entryToRange({ startDate: "2021-01-01", endDate: "2021-01-01" }, today)).toEqual(range("2021-01-01", "2021-01-02"));
  });
  it("skips reversed ranges and unparsable dates", () => {
    expect(entryToRange({ startDate: "2021-01-01", endDate: "2020-12-31" }, today)).toBeNull();
    expect(entryToRange({ startDate: "2021-01-01", endDate: "2020-01-01" }, today)).toBeNull();
    expect(entryToRange({ startDate: "garbage" }, today)).toBeNull();
  });
});

describe("inclusive anniversaries", () => {
  const dur = (start: string, end: string | null, todayYmd = "2026-11-13") =>
    durationOf([entryToRange({ startDate: start, endDate: end }, ymdToDay(todayYmd))!]);

  it("15 May 2025 -> 14 May 2026 is exactly 1 year", () => {
    expect(dur("2025-05-15", "2026-05-14")).toMatchObject({ years: 1, months: 0, days: 0, totalDays: 365 });
  });
  it("the day before the anniversary is not yet a year", () => {
    expect(dur("2025-05-15", "2026-05-13")).toMatchObject({ years: 0, months: 11, days: 29, totalDays: 364 });
  });
  it("1 Jan 2023 -> 10 Apr 2025 is 2 years, 3 months, 10 days", () => {
    expect(dur("2023-01-01", "2025-04-10")).toMatchObject({ years: 2, months: 3, days: 10 });
  });
  it("12 Apr 2025 -> today (13 Nov 2026) is 1 year, 7 months, 2 days", () => {
    expect(dur("2025-04-12", null)).toMatchObject({ years: 1, months: 7, days: 2 });
  });
  it("clamps month-end starts: 31 Jan -> 27 Feb is 1 month", () => {
    expect(dur("2025-01-31", "2025-02-27")).toMatchObject({ years: 0, months: 1, days: 0 });
  });
  it("back-to-back roles are contiguous, a one-day gap is not counted", () => {
    const t = ymdToDay("2026-11-13");
    const a = entryToRange({ startDate: "2025-01-01", endDate: "2025-03-31" }, t)!;
    const b = entryToRange({ startDate: "2025-04-01", endDate: "2025-06-30" }, t)!;
    expect(durationOf([a, b])).toMatchObject({ months: 6, days: 0, totalDays: 181 });
    const c = entryToRange({ startDate: "2025-04-02", endDate: "2025-06-30" }, t)!;
    expect(durationOf([a, c]).totalDays).toBe(180);
  });
});

describe("graduationMonthStart", () => {
  it("collapses a graduation date to the first day of its month", () => {
    expect(graduationMonthStart("2019-06-23")).toBe("2019-06-01");
    expect(graduationMonthStart(null)).toBeNull();
  });
});

describe("leap years", () => {
  const dur = (start: string, end: string | null, todayYmd = "2026-11-13") =>
    durationOf([entryToRange({ startDate: start, endDate: end }, ymdToDay(todayYmd))!]);

  it("a full leap year (1 Jan -> 31 Dec 2024) is 1 year, 366 days", () => {
    expect(dur("2024-01-01", "2024-12-31")).toMatchObject({ years: 1, months: 0, days: 0, totalDays: 366 });
  });
  it("a full non-leap year is 1 year, 365 days", () => {
    expect(dur("2025-01-01", "2025-12-31")).toMatchObject({ years: 1, months: 0, days: 0, totalDays: 365 });
  });
  it("a range spanning 29 Feb 2024 keeps calendar months (15 Jan -> 14 Mar 2024 = 2 months)", () => {
    expect(dur("2024-01-15", "2024-03-14")).toMatchObject({ years: 0, months: 2, days: 0, totalDays: 60 });
  });
  it("Feb in a leap year has 29 days (1 Feb -> 29 Feb 2024 = 1 month)", () => {
    expect(dur("2024-02-01", "2024-02-29")).toMatchObject({ years: 0, months: 1, days: 0, totalDays: 29 });
  });
  it("Feb in a non-leap year has 28 days (1 Feb -> 28 Feb 2025 = 1 month)", () => {
    expect(dur("2025-02-01", "2025-02-28")).toMatchObject({ years: 0, months: 1, days: 0, totalDays: 28 });
  });
  it("29 Feb start: anniversary falls on 28 Feb in a non-leap year (29 Feb 2024 -> 27 Feb 2025 = 1 year)", () => {
    expect(dur("2024-02-29", "2025-02-27")).toMatchObject({ years: 1, months: 0, days: 0 });
  });
  it("29 Feb start: the day before that is still 11 months", () => {
    expect(dur("2024-02-29", "2025-02-26")).toMatchObject({ years: 0, months: 11 });
  });
  it("29 Feb start reaches its next leap anniversary on 28 Feb 2028 (4 years)", () => {
    expect(dur("2024-02-29", "2028-02-28")).toMatchObject({ years: 4, months: 0, days: 0 });
  });
  it("31 Jan start in a leap year clamps to 29 Feb (31 Jan -> 28 Feb 2024 = 1 month)", () => {
    expect(dur("2024-01-31", "2024-02-28")).toMatchObject({ years: 0, months: 1, days: 0 });
  });
  it("an ongoing role across a leap day (15 May 2023 -> today 13 Nov 2026)", () => {
    expect(dur("2023-05-15", null)).toMatchObject({ years: 3, months: 6, days: 0 });
  });
});
