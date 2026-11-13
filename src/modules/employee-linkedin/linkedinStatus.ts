// Pure helpers for the LinkedIn status card - no DB access, unit-testable.

/** Accepts DATE columns as 'YYYY-MM-DD' strings or Dates; returns [y, m, d] or null. */
function ymd(value: unknown): [number, number, number] | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return [value.getFullYear(), value.getMonth() + 1, value.getDate()];
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * Whole calendar months from the OXO hire date to the LinkedIn update date
 * (start date of the newest non-OXO role). Null when either date is missing
 * or the LinkedIn date is not after the hire date - i.e. no "update" to flag.
 */
export function monthsBetween(hireDate: unknown, linkedinDate: unknown): number | null {
  const a = ymd(hireDate);
  const b = ymd(linkedinDate);
  if (!a || !b) return null;
  const cmp = b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
  if (cmp <= 0) return null;
  let months = (b[0] - a[0]) * 12 + (b[1] - a[1]);
  if (b[2] < a[2]) months -= 1;
  return Math.max(months, 0);
}

/** Company names that count as "OXO Tech" on LinkedIn: "OXO Tech", "OXO Technologies", "OXO Tech (Pvt) Ltd", ... */
export function isOxoTechCompany(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return /(^|[^a-z0-9])oxo([^a-z0-9]|$)/.test(n) && n.includes('tech');
}

const DAY_MS = 86_400_000;
const utcDay = (p: [number, number, number]) => Date.UTC(p[0], p[1] - 1, p[2]);

/**
 * How much of the employee's OXO Tech tenure their LinkedIn shows, as 0-100.
 * 100 = LinkedIn lists OXO Tech from the join date (or earlier); it drops the
 * later the OXO role start date is relative to the hire date. 0 when the newest
 * LinkedIn role is not OXO Tech. Null when it cannot be judged (missing dates).
 */
export function coveragePercent(
  hireDate: unknown,
  linkedinStart: unknown,
  latestCompany: string | null | undefined,
  today: Date = new Date(),
): number | null {
  if (!latestCompany) return null;
  if (!isOxoTechCompany(latestCompany)) return 0;
  const h = ymd(hireDate);
  const l = ymd(linkedinStart);
  if (!h || !l) return null;
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const tenure = now - utcDay(h);
  if (tenure <= 0) return 100;
  const shown = now - Math.min(Math.max(utcDay(l), utcDay(h)), now);
  return Math.round(Math.min(shown / tenure, 1) * 100);
}

export type LinkedinFlag = 'green' | 'red' | 'pending';

export interface LinkedinRow {
  linkedinProfile: string | null;
  linkedinConnectedAt: Date | null;
  linkedinSyncRequestedAt: Date | null;
  linkedinLatestCompany: string | null;
  linkedinLatestTitle: string | null;
  linkedinLatestStartDate: unknown;
  linkedinSyncedAt: Date | null;
  linkedinSyncError: string | null;
  hireDate: unknown;
}

export interface LinkedinStatus {
  connected: boolean;
  profileUrl: string | null;
  connectedAt: string | null;
  syncPending: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
  latestCompany: string | null;
  latestTitle: string | null;
  /** The LinkedIn "update date": start of the newest non-OXO role (YYYY-MM-DD). */
  linkedinUpdateDate: string | null;
  hireDate: string | null;
  monthsAfterJoining: number | null;
  /** True when LinkedIn shows a role that started after the OXO join date. */
  updatedAfterJoining: boolean;
  /** green = newest LinkedIn role is OXO Tech, red = it is not, pending = nothing synced yet. */
  flag: LinkedinFlag;
  /** Share (0-100) of the OXO tenure that LinkedIn reflects; see coveragePercent. */
  coveragePercent: number | null;
  /** Months from the hire date to today. */
  tenureMonths: number | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const dateOnly = (v: unknown) => {
  const p = ymd(v);
  return p ? `${p[0]}-${String(p[1]).padStart(2, '0')}-${String(p[2]).padStart(2, '0')}` : null;
};

export function buildLinkedinStatus(row: LinkedinRow, today: Date = new Date()): LinkedinStatus {
  const connected = row.linkedinConnectedAt != null;
  const months = connected ? monthsBetween(row.hireDate, row.linkedinLatestStartDate) : null;
  const synced = connected && row.linkedinSyncedAt != null && !row.linkedinSyncError;
  const flag: LinkedinFlag = !synced
    ? 'pending'
    : isOxoTechCompany(row.linkedinLatestCompany)
      ? 'green'
      : 'red';
  const tenureMonths = monthsBetween(row.hireDate, today);
  return {
    connected,
    profileUrl: row.linkedinProfile ?? null,
    connectedAt: iso(row.linkedinConnectedAt),
    syncPending: connected && row.linkedinSyncRequestedAt != null,
    lastSyncedAt: iso(row.linkedinSyncedAt),
    syncError: connected ? row.linkedinSyncError ?? null : null,
    latestCompany: connected ? row.linkedinLatestCompany ?? null : null,
    latestTitle: connected ? row.linkedinLatestTitle ?? null : null,
    linkedinUpdateDate: connected ? dateOnly(row.linkedinLatestStartDate) : null,
    hireDate: dateOnly(row.hireDate),
    monthsAfterJoining: months,
    updatedAfterJoining: months !== null,
    flag,
    coveragePercent: synced ? coveragePercent(row.hireDate, row.linkedinLatestStartDate, row.linkedinLatestCompany, today) : null,
    tenureMonths,
  };
}
