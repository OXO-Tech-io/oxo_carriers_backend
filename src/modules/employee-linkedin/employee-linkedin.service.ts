import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNotNull, isNull, or, lt, sql } from 'drizzle-orm';
import { db } from '../../db';
import { employee } from '../../db/schema';
import { JwtPayload, UserRole } from '../../types';
import { decryptPII } from '../../utils/encryption';
import { buildLinkedinStatus, LinkedinStatus } from './linkedinStatus';

/** Connected profiles not synced for this long are picked up by the scheduled job. */
export const STALE_AFTER_DAYS = 7;

export interface SyncResultInput {
  latestCompany?: string | null;
  latestTitle?: string | null;
  latestStartDate?: string | null;
  error?: string | null;
}

export interface LinkedinOverviewRow extends LinkedinStatus {
  id: number;
  employeeId: string | null;
  name: string;
  email: string;
  department: string | null;
  position: string | null;
}

export interface SyncQueueItem {
  id: number;
  employeeId: string | null;
  linkedinProfile: string;
  requested: boolean;
}

@Injectable()
export class EmployeeLinkedinService {
  private async load(id: number) {
    const row = await db.query.employee.findFirst({ where: eq(employee.id, id) });
    if (!row) throw new NotFoundException('Employee not found');
    return row;
  }

  /** The LinkedIn connection is managed by administrators only - employees no longer see or control it. */
  private assertAccess(actor: JwtPayload) {
    if (actor.role === UserRole.SUPER_ADMIN) return;
    throw new ForbiddenException('Only administrators can manage LinkedIn connections');
  }

  /** Administrator view: every active employee with their LinkedIn state. */
  async overview(actor: JwtPayload): Promise<LinkedinOverviewRow[]> {
    this.assertAccess(actor);
    const rows = await db.query.employee.findMany({
      where: and(isNull(employee.deletedAt), eq(employee.status, 'active')),
    });
    return rows
      .map((r) => ({
        ...buildLinkedinStatus(r),
        id: r.id,
        employeeId: r.employeeId,
        name: `${decryptPII(r.firstName) ?? ''} ${decryptPII(r.lastName) ?? ''}`.trim(),
        email: decryptPII(r.email) ?? '',
        department: r.department ?? null,
        position: r.position ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Connects every employee that has a LinkedIn URL and queues a sync for them (or just re-queues connected ones). */
  async syncAll(actor: JwtPayload): Promise<{ queued: number }> {
    this.assertAccess(actor);
    const now = new Date();
    const queued = await db
      .update(employee)
      .set({ linkedinConnectedAt: sql`coalesce(${employee.linkedinConnectedAt}, ${now})`, linkedinSyncRequestedAt: now, linkedinSyncError: null })
      .where(and(isNull(employee.deletedAt), eq(employee.status, 'active'), isNotNull(employee.linkedinProfile), sql`btrim(${employee.linkedinProfile}) <> ''`))
      .returning({ id: employee.id });
    return { queued: queued.length };
  }

  async getStatus(id: number, actor: JwtPayload): Promise<LinkedinStatus> {
    const row = await this.load(id);
    this.assertAccess(actor);
    return buildLinkedinStatus(row);
  }

  async connect(id: number, actor: JwtPayload): Promise<LinkedinStatus> {
    const row = await this.load(id);
    this.assertAccess(actor);
    if (!row.linkedinProfile?.trim()) {
      throw new BadRequestException('This employee has no LinkedIn profile URL on their profile');
    }
    const now = new Date();
    await db
      .update(employee)
      .set({ linkedinConnectedAt: now, linkedinSyncRequestedAt: now, linkedinSyncError: null })
      .where(eq(employee.id, id));
    return buildLinkedinStatus(await this.load(id));
  }

  /** Withdraws consent and removes everything synced from LinkedIn. The profile URL itself is kept. */
  async disconnect(id: number, actor: JwtPayload): Promise<LinkedinStatus> {
    const row = await this.load(id);
    this.assertAccess(actor);
    await db
      .update(employee)
      .set({
        linkedinConnectedAt: null,
        linkedinSyncRequestedAt: null,
        linkedinLatestCompany: null,
        linkedinLatestTitle: null,
        linkedinLatestStartDate: null,
        linkedinSyncedAt: null,
        linkedinSyncError: null,
      })
      .where(eq(employee.id, id));
    return buildLinkedinStatus(await this.load(id));
  }

  /** Manual refresh: flags the employee so the importer syncs them on its next run. */
  async requestRefresh(id: number, actor: JwtPayload): Promise<LinkedinStatus> {
    const row = await this.load(id);
    this.assertAccess(actor);
    if (!row.linkedinConnectedAt) throw new BadRequestException('LinkedIn is not connected');
    await db.update(employee).set({ linkedinSyncRequestedAt: new Date() }).where(eq(employee.id, id));
    return buildLinkedinStatus(await this.load(id));
  }

  /** Importer: connected employees that were asked to refresh, never synced, or are stale. */
  async syncQueue(): Promise<SyncQueueItem[]> {
    const rows = await db
      .select({
        id: employee.id,
        employeeId: employee.employeeId,
        linkedinProfile: employee.linkedinProfile,
        requestedAt: employee.linkedinSyncRequestedAt,
      })
      .from(employee)
      .where(
        and(
          isNotNull(employee.linkedinConnectedAt),
          isNotNull(employee.linkedinProfile),
          isNull(employee.deletedAt),
          or(
            isNotNull(employee.linkedinSyncRequestedAt),
            isNull(employee.linkedinSyncedAt),
            lt(employee.linkedinSyncedAt, sql`now() - make_interval(days => ${STALE_AFTER_DAYS})`),
          ),
        ),
      );
    return rows
      .filter((r) => !!r.linkedinProfile)
      .map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        linkedinProfile: r.linkedinProfile as string,
        requested: r.requestedAt != null,
      }));
  }

  /** Importer: store what it read. Rejected if the employee disconnected in the meantime. */
  async recordSyncResult(id: number, input: SyncResultInput): Promise<LinkedinStatus> {
    const row = await this.load(id);
    if (!row.linkedinConnectedAt) throw new BadRequestException('LinkedIn is not connected');
    const error = input.error?.trim().slice(0, 255) || null;
    const set: Partial<typeof employee.$inferInsert> = {
      linkedinSyncedAt: new Date(),
      linkedinSyncRequestedAt: null,
      linkedinSyncError: error,
    };
    if (!error) {
      if (input.latestStartDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.latestStartDate)) {
        throw new BadRequestException('latestStartDate must be YYYY-MM-DD');
      }
      set.linkedinLatestCompany = input.latestCompany?.trim().slice(0, 255) || null;
      set.linkedinLatestTitle = input.latestTitle?.trim().slice(0, 255) || null;
      set.linkedinLatestStartDate = input.latestStartDate || null;
    }
    await db.update(employee).set(set).where(eq(employee.id, id));
    return buildLinkedinStatus(await this.load(id));
  }
}
