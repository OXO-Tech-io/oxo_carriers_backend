import { Injectable } from '@nestjs/common';
import pool from '../../config/database';
import { LeaveCalendar } from '../../types';

export interface WorkLogDeadlineSettings {
  isEnabled: boolean;
  deadlineTime: string; // 'HH:MM'
  timezone: string;     // IANA zone, e.g. 'Asia/Colombo'
  updatedBy: number | null;
  updatedAt: Date | null;
}

export interface DeadlineOutcome {
  /** Resolved cut-off instant, or null when no deadline applies to this date. */
  deadlineAt: Date | null;
  isLate: boolean;
  /** Why no deadline applied - surfaced to the UI so it can explain itself. */
  exemptReason: 'disabled' | 'weekend' | 'holiday' | null;
}

const DEFAULT_SETTINGS: WorkLogDeadlineSettings = {
  isEnabled: false,
  deadlineTime: '18:00',
  timezone: 'Asia/Colombo',
  updatedBy: null,
  updatedAt: null,
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Milliseconds to add to a UTC instant to get the wall-clock reading in
 * `timeZone`. Intl is the only DST-correct source available without pulling in
 * a date library (the repo has none).
 */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // Intl renders midnight as hour 24 in some ICU versions; normalise to 0.
  const hour = get('hour') % 24;
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asIfUtc - at.getTime();
}

/**
 * Resolve a wall-clock date + time in `timeZone` to a UTC instant. Two passes:
 * the first guesses the offset from the naive reading, the second re-checks it
 * at the corrected instant so dates near a DST transition land correctly.
 */
function zonedWallClockToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  let instant = naive - zoneOffsetMs(new Date(naive), timeZone);
  instant = naive - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** Sat/Sun in the plain 'YYYY-MM-DD' work date - no timezone shifting. */
function isWeekend(dateStr: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dow === 0 || dow === 6;
}

function toDateKey(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Reads and writes the singleton tbl_work_log_settings row, and decides whether
 * a work log submitted at a given instant counts as late for a given work date.
 *
 * Exemptions, in the order the rules are applied:
 *   1. feature disabled              -> no deadline
 *   2. work date is a Saturday/Sunday -> no deadline
 *   3. work date is on the leave calendar -> no deadline
 *
 * Rule 3 is why adding a holiday in Admin > Leave Calendar automatically stops
 * the deadline applying that day; nothing needs to be re-saved here.
 */
@Injectable()
export class WorkLogDeadlineService {
  async getSettings(): Promise<WorkLogDeadlineSettings> {
    const result = await pool.query(
      `SELECT is_enabled, deadline_time, timezone, updated_by, updated_at
         FROM tbl_work_log_settings
        WHERE id = 1`,
    );
    const row = (result.rows as any[])[0];
    if (!row) return { ...DEFAULT_SETTINGS };

    return {
      isEnabled: Boolean(row.is_enabled),
      // Postgres `time` columns come back as 'HH:MM:SS'; the column is varchar
      // here but stay tolerant of both shapes.
      deadlineTime: String(row.deadline_time).slice(0, 5),
      timezone: row.timezone || DEFAULT_SETTINGS.timezone,
      updatedBy: row.updated_by ?? null,
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    };
  }

  async updateSettings(
    updatedBy: number | null,
    updates: { isEnabled?: boolean; deadlineTime?: string; timezone?: string },
  ): Promise<WorkLogDeadlineSettings> {
    const current = await this.getSettings();
    const next: WorkLogDeadlineSettings = {
      ...current,
      isEnabled: updates.isEnabled ?? current.isEnabled,
      deadlineTime: updates.deadlineTime ?? current.deadlineTime,
      timezone: updates.timezone ?? current.timezone,
    };

    await pool.query(
      `INSERT INTO tbl_work_log_settings (id, is_enabled, deadline_time, timezone, updated_by, updated_at)
            VALUES (1, $1, $2, $3, $4, now())
       ON CONFLICT (id) DO UPDATE
               SET is_enabled = EXCLUDED.is_enabled,
                   deadline_time = EXCLUDED.deadline_time,
                   timezone = EXCLUDED.timezone,
                   updated_by = EXCLUDED.updated_by,
                   updated_at = now()`,
      [next.isEnabled, next.deadlineTime, next.timezone, updatedBy],
    );

    return this.getSettings();
  }

  /**
   * Leave-calendar dates in [from, to] that exempt a work date, as a set of
   * 'YYYY-MM-DD' keys.
   *
   * Recurring entries are matched on month/day across the requested range
   * rather than on their stored year - a holiday flagged "recurring" is meant
   * to exempt every year, which an exact-date match (LeaveCalendarModel.
   * isHoliday) can only do in the year it was created.
   */
  async getExemptDates(from: string, to: string): Promise<Set<string>> {
    const result = await pool.query(
      `SELECT date, is_recurring FROM tbl_leave_calendar`,
    );
    const rows = result.rows as Array<Pick<LeaveCalendar, 'is_recurring'> & { date: Date | string }>;

    const exempt = new Set<string>();
    const fromKey = from.slice(0, 10);
    const toKey = to.slice(0, 10);
    const firstYear = Number(fromKey.slice(0, 4));
    const lastYear = Number(toKey.slice(0, 4));

    for (const row of rows) {
      const key = toDateKey(row.date);
      if (row.is_recurring) {
        const monthDay = key.slice(5);
        for (let year = firstYear; year <= lastYear; year++) {
          const candidate = `${year}-${monthDay}`;
          if (candidate >= fromKey && candidate <= toKey) exempt.add(candidate);
        }
      } else if (key >= fromKey && key <= toKey) {
        exempt.add(key);
      }
    }

    return exempt;
  }

  /** Deadline outcome for a single work date. */
  async evaluate(workDate: string, submittedAt: Date = new Date()): Promise<DeadlineOutcome> {
    const [outcome] = await this.evaluateMany([workDate], submittedAt);
    return outcome;
  }

  /**
   * Batch form of `evaluate` - settings and the leave calendar are read once
   * for the whole set, so bulk Excel uploads stay at two queries regardless of
   * row count.
   */
  async evaluateMany(workDates: string[], submittedAt: Date = new Date()): Promise<DeadlineOutcome[]> {
    const settings = await this.getSettings();
    if (!settings.isEnabled || !workDates.length) {
      return workDates.map(() => ({ deadlineAt: null, isLate: false, exemptReason: 'disabled' as const }));
    }

    // 'YYYY-MM-DD' sorts lexicographically, so plain min/max bounds the range.
    const keys = workDates.map((d) => d.slice(0, 10));
    const exempt = await this.getExemptDates(
      keys.reduce((min, key) => (key < min ? key : min)),
      keys.reduce((max, key) => (key > max ? key : max)),
    );

    return workDates.map((workDate) => this.resolve(workDate, submittedAt, settings, exempt));
  }

  /**
   * Deadline for a date as the employee's own Work Log page shows it - same
   * rules as `evaluate`, but reported without reference to any submission.
   */
  async describe(workDate: string): Promise<{
    workDate: string;
    isEnabled: boolean;
    deadlineTime: string;
    timezone: string;
    deadlineAt: string | null;
    exemptReason: DeadlineOutcome['exemptReason'];
    hasPassed: boolean;
  }> {
    const settings = await this.getSettings();
    const outcome: DeadlineOutcome = settings.isEnabled
      ? this.resolve(workDate, new Date(), settings, await this.getExemptDates(workDate, workDate))
      : { deadlineAt: null, isLate: false, exemptReason: 'disabled' };
    return {
      workDate,
      isEnabled: settings.isEnabled,
      deadlineTime: settings.deadlineTime,
      timezone: settings.timezone,
      deadlineAt: outcome.deadlineAt ? outcome.deadlineAt.toISOString() : null,
      exemptReason: outcome.exemptReason,
      hasPassed: outcome.isLate,
    };
  }

  private resolve(
    workDate: string,
    submittedAt: Date,
    settings: WorkLogDeadlineSettings,
    exempt: Set<string>,
  ): DeadlineOutcome {
    const key = workDate.slice(0, 10);

    if (isWeekend(key)) return { deadlineAt: null, isLate: false, exemptReason: 'weekend' };
    if (exempt.has(key)) return { deadlineAt: null, isLate: false, exemptReason: 'holiday' };

    const deadlineAt = zonedWallClockToUtc(key, settings.deadlineTime, settings.timezone);
    return { deadlineAt, isLate: submittedAt.getTime() > deadlineAt.getTime(), exemptReason: null };
  }
}

export const isValidDeadlineTime = (value: string): boolean => HHMM.test(value);
export const isValidTimezone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};
