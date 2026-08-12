import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { EmployeeWorkSession } from '../../db/schema';
import { AttendanceSessionModel } from './AttendanceSession';

export interface TodayAttendance {
  sessions: EmployeeWorkSession[];
  firstLoginAt: Date | null;
  lastLogoutAt: Date | null;
  totalDurationSec: number;
  status: 'active' | 'ended' | 'none';
}

export interface AttendanceHistoryDay {
  date: string;
  firstLoginAt: Date | null;
  lastLogoutAt: Date | null;
  totalDurationSec: number;
  sessionCount: number;
}

const HISTORY_LOOKBACK_DAYS = 30;
const DEFAULT_HISTORY_LIMIT = 7;

// Server-local calendar date, e.g. "2026-08-12" - simplification for a manual
// clock in/out widget; no employee timezone handling yet (see attendance
// module's plan notes for what's deliberately deferred).
function dateKey(date: Date): string {
  return date.toLocaleDateString('en-CA'); // en-CA formats as YYYY-MM-DD
}

function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function sessionDurationSec(session: EmployeeWorkSession, now: Date): number {
  if (session.totalDurationSec != null) return session.totalDurationSec;
  if (!session.loginAt) return 0;
  return Math.max(0, Math.round((now.getTime() - session.loginAt.getTime()) / 1000));
}

@Injectable()
export class AttendanceService {
  async clockIn(employeeId: string): Promise<EmployeeWorkSession> {
    const active = await AttendanceSessionModel.findActive(employeeId);
    if (active) {
      throw new ConflictException('You are already clocked in');
    }
    return AttendanceSessionModel.create(employeeId);
  }

  async clockOut(employeeId: string): Promise<EmployeeWorkSession> {
    const ended = await AttendanceSessionModel.endActive(employeeId);
    if (!ended) {
      throw new NotFoundException('No active session found. Please clock in first.');
    }
    return ended;
  }

  async getToday(employeeId: string): Promise<TodayAttendance> {
    const now = new Date();
    const sessions = await AttendanceSessionModel.findSince(employeeId, startOfDay(now));

    let firstLoginAt: Date | null = null;
    let lastLogoutAt: Date | null = null;
    let totalDurationSec = 0;
    let hasActive = false;

    for (const session of sessions) {
      if (session.loginAt && (!firstLoginAt || session.loginAt < firstLoginAt)) {
        firstLoginAt = session.loginAt;
      }
      if (session.logoutAt && (!lastLogoutAt || session.logoutAt > lastLogoutAt)) {
        lastLogoutAt = session.logoutAt;
      }
      totalDurationSec += sessionDurationSec(session, now);
      if (session.status === 'active') hasActive = true;
    }

    return {
      sessions,
      firstLoginAt,
      lastLogoutAt,
      totalDurationSec,
      status: hasActive ? 'active' : sessions.length ? 'ended' : 'none',
    };
  }

  async getHistory(employeeId: string, limit = DEFAULT_HISTORY_LIMIT): Promise<AttendanceHistoryDay[]> {
    const now = new Date();
    const since = startOfDay(now);
    since.setDate(since.getDate() - HISTORY_LOOKBACK_DAYS);
    const sessions = await AttendanceSessionModel.findSince(employeeId, since);

    const byDate = new Map<string, EmployeeWorkSession[]>();
    for (const session of sessions) {
      if (!session.loginAt) continue;
      const key = dateKey(session.loginAt);
      const bucket = byDate.get(key);
      if (bucket) bucket.push(session);
      else byDate.set(key, [session]);
    }

    const days: AttendanceHistoryDay[] = [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, limit)
      .map(([date, daySessions]) => {
        let firstLoginAt: Date | null = null;
        let lastLogoutAt: Date | null = null;
        let totalDurationSec = 0;
        for (const session of daySessions) {
          if (session.loginAt && (!firstLoginAt || session.loginAt < firstLoginAt)) {
            firstLoginAt = session.loginAt;
          }
          if (session.logoutAt && (!lastLogoutAt || session.logoutAt > lastLogoutAt)) {
            lastLogoutAt = session.logoutAt;
          }
          totalDurationSec += sessionDurationSec(session, now);
        }
        return { date, firstLoginAt, lastLogoutAt, totalDurationSec, sessionCount: daySessions.length };
      });

    return days;
  }
}
