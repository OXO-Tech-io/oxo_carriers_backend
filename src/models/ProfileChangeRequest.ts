import { db } from '../db';
import {
  profileChangeRequests,
  type ProfileChangeRequest as DrizzleProfileChangeRequest,
} from '../db/schema';
import { and, eq } from 'drizzle-orm';
import type { ProfileChangeItem } from '../validators/profileChangeRequest.validator';

export type ProfileChangeRequestCreateInput = {
  employeeId: string;
  submittedBy: number;
  changes: ProfileChangeItem[];
  comments?: string | null;
  previousRequestId?: number | null;
};

export type ProfileChangeRequestListFilters = {
  status?: DrizzleProfileChangeRequest['status'];
};

type MinimalEmployee = { id: number; firstName: string; lastName: string; email: string; employeeId: string | null };
type MinimalReviewer = { id: number; firstName: string; lastName: string };

// Eager-loads the requester/reviewer's name so the frontend approvals table
// doesn't need a second round-trip per row just to show "who submitted this".
export type ProfileChangeRequestWithRelations = DrizzleProfileChangeRequest & {
  employee?: MinimalEmployee | null;
  reviewer?: MinimalReviewer | null;
};

const employeeColumns = { id: true, firstName: true, lastName: true, email: true, employeeId: true } as const;
const reviewerColumns = { id: true, firstName: true, lastName: true } as const;

export class ProfileChangeRequestModel {
  static async create(data: ProfileChangeRequestCreateInput): Promise<DrizzleProfileChangeRequest> {
    const [inserted] = await db
      .insert(profileChangeRequests)
      .values({
        employeeId: data.employeeId,
        submittedBy: data.submittedBy,
        changes: data.changes,
        comments: data.comments ?? null,
        previousRequestId: data.previousRequestId ?? null,
        status: 'pending_approval',
      })
      .returning();
    if (!inserted) throw new Error('Failed to create profile change request');
    return inserted;
  }

  static async findById(id: number): Promise<ProfileChangeRequestWithRelations | null> {
    const record = await db.query.profileChangeRequests.findFirst({
      where: eq(profileChangeRequests.id, id),
      with: {
        employee: { columns: employeeColumns },
        reviewer: { columns: reviewerColumns },
      },
    });
    return record ?? null;
  }

  static async listByEmployeeId(
    employeeId: string,
    filters?: ProfileChangeRequestListFilters
  ): Promise<ProfileChangeRequestWithRelations[]> {
    const conditions = [eq(profileChangeRequests.employeeId, employeeId)];
    if (filters?.status) {
      conditions.push(eq(profileChangeRequests.status, filters.status));
    }
    return db.query.profileChangeRequests.findMany({
      where: and(...conditions),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      with: {
        employee: { columns: employeeColumns },
        reviewer: { columns: reviewerColumns },
      },
    });
  }

  static async listAll(filters?: ProfileChangeRequestListFilters): Promise<ProfileChangeRequestWithRelations[]> {
    return db.query.profileChangeRequests.findMany({
      where: filters?.status ? eq(profileChangeRequests.status, filters.status) : undefined,
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      with: {
        employee: { columns: employeeColumns },
        reviewer: { columns: reviewerColumns },
      },
    });
  }

  static async updateStatus(
    id: number,
    status: DrizzleProfileChangeRequest['status'],
    reviewerId: number,
    reviewerComments: string | null,
    decidedAt: Date
  ): Promise<ProfileChangeRequestWithRelations | null> {
    await db
      .update(profileChangeRequests)
      .set({ status, reviewerId, reviewerComments, decidedAt, updatedAt: new Date() })
      .where(eq(profileChangeRequests.id, id));
    return this.findById(id);
  }
}
