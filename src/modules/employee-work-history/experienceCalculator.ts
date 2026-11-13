// Pure date maths for the Work History Summary - no DB access, so it can be
// unit-tested with plain data (see tests/unit/experience-calculator.test.ts).
//
// Rules:
//  - Every duration is computed over the UNION of the entries' date ranges, so
//    overlapping roles (e.g. a part-time job during an internship) are counted
//    once, and gaps between roles (career breaks) are never counted.
//  - Anniversaries are INCLUSIVE: the start date is day 1 of service and the
//    end date (or today, for a null end date = "still working") is a day worked
//    too. 2018-01-01 -> 2019-12-31 is exactly 2 years; 15 May 2025 -> 14 May 2026
//    is exactly 1 year. Internally a range is half-open [start, end) with
//    end = last day worked + 1.
//  - Durations are reported as calendar years/months/days (not a decimal that
//    drifts with leap years); `totalDays` is the exact day count of the union.

export interface DayRange {
  start: number; // days since 1970-01-01 (UTC)
  end: number; // exclusive
}

export interface Duration {
  years: number;
  months: number;
  days: number;
  totalDays: number;
}

export interface ExperienceEntry {
  startDate: unknown;
  endDate?: unknown;
  employmentType?: string | null;
  careerPath?: string | null;
}

const MS_PER_DAY = 86_400_000;
const YMD = /^(\d{4})-(\d{2})-(\d{2})/;

// DATE columns come back as 'YYYY-MM-DD' strings from drizzle, but tolerate Date
// objects (local calendar parts - a Date here came from a local-midnight parse)
// and full ISO strings (calendar part of the string).
export function toYmd(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${m}-${d}`;
  }
  if (typeof value === 'string') {
    const match = YMD.exec(value);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
  }
  return null;
}

export function ymdToDay(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function dayToYmd(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function entryToRange(entry: ExperienceEntry, todayDay: number): DayRange | null {
  const startYmd = toYmd(entry.startDate);
  if (!startYmd) return null;
  const endYmd = entry.endDate ? toYmd(entry.endDate) : null;
  const start = ymdToDay(startYmd);
  // Inclusive of the last day worked (the end date, or today when still employed).
  const end = (endYmd ? ymdToDay(endYmd) : todayDay) + 1;
  return end > start ? { start, end } : null;
}

export function mergeRanges(ranges: DayRange[]): DayRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: DayRange[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

// Only the part of each range on/after `fromDay`.
export function clampFrom(ranges: DayRange[], fromDay: number): DayRange[] {
  return ranges
    .map((r) => ({ start: Math.max(r.start, fromDay), end: r.end }))
    .filter((r) => r.end > r.start);
}

// Whole calendar months between two days, plus the leftover days.
function calendarDiff(startDay: number, endDay: number): { months: number; days: number } {
  const s = new Date(startDay * MS_PER_DAY);
  const e = new Date(endDay * MS_PER_DAY);
  let months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth());
  // Anchor = start + `months`, clamped to the target month's last day (Jan 31 + 1 month = Feb 28/29).
  const anchorDay = (m: number) => {
    const first = Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + m, 1);
    const lastOfMonth = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + m + 1, 0)).getUTCDate();
    return Math.round(first / MS_PER_DAY) + Math.min(s.getUTCDate(), lastOfMonth) - 1;
  };
  if (anchorDay(months) > endDay) months -= 1;
  return { months, days: endDay - anchorDay(months) };
}

export function durationOf(ranges: DayRange[]): Duration {
  const merged = mergeRanges(ranges);
  let totalDays = 0;
  let months = 0;
  let days = 0;
  for (const r of merged) {
    totalDays += r.end - r.start;
    const diff = calendarDiff(r.start, r.end);
    months += diff.months;
    days += diff.days;
  }
  // Leftover days from separate stints are pooled into months (30-day months).
  months += Math.floor(days / 30);
  days %= 30;
  return { years: Math.floor(months / 12), months: months % 12, days, totalDays };
}

export const ZERO_DURATION: Duration = { years: 0, months: 0, days: 0, totalDays: 0 };

// "First degree completion" -> the first day of the graduation month (the
// profile captures month + year of graduation, so the day is not meaningful).
export function graduationMonthStart(dateAwarded: unknown): string | null {
  const ymd = toYmd(dateAwarded);
  return ymd ? `${ymd.slice(0, 7)}-01` : null;
}
