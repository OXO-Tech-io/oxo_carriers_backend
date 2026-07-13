import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  users,
  employeePii,
  employeeEducation,
  employeeWorkHistory,
  profileChangeRequests,
  auditLogs,
  notifications,
  type ProfileChangeRequest as DrizzleProfileChangeRequest,
} from '../db/schema';
import { ProfileChangeRequestModel } from '../models/ProfileChangeRequest';
import { EmployeeModel } from '../models/User';
import { UserRole } from '../types';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/AppError';
import { encryptPII } from '../utils/encryption';
import { env } from '../config/env';
import type {
  BankAccountValue,
  ListProfileChangeRequestsQuery,
  ProfileChangeItem,
  SubmitProfileChangeRequestInput,
} from '../validators/profileChangeRequest.validator';

const HR_ROLES: UserRole[] = [UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE, UserRole.SUPER_ADMIN];

const summarizeChanges = (changes: ProfileChangeItem[]): string[] =>
  changes.map(item => {
    if (item.entityType === 'user_field') return item.field === 'bank_account' ? 'Bank Account' : item.field;
    if (item.entityType === 'employee_pii_field') return 'Address';
    if (item.entityType === 'education') return `Education (${item.operation})`;
    return `Work History (${item.operation})`;
  });

export const profileChangeRequestService = {
  summarizeChanges,

  async submitChangeRequest(
    userId: number,
    input: SubmitProfileChangeRequestInput
  ): Promise<DrizzleProfileChangeRequest> {
    let previousRequestId: number | undefined;
    if (input.previousRequestId) {
      const previous = await ProfileChangeRequestModel.findById(input.previousRequestId);
      if (!previous || previous.userId !== userId) {
        throw new NotFoundError('Previous request not found');
      }
      if (previous.status !== 'returned_for_modification') {
        throw new BadRequestError('Only a returned-for-modification request can be resubmitted');
      }
      previousRequestId = previous.id;
    }

    const created = await ProfileChangeRequestModel.create({
      userId,
      submittedBy: userId,
      changes: input.changes,
      comments: input.comments ?? null,
      previousRequestId,
    });

    await db.insert(auditLogs).values({
      userId,
      action: 'profile_change_request.submitted',
      tableName: 'profile_change_requests',
      recordId: created.id,
      oldValues: null,
      newValues: { changes: input.changes },
    });

    const hrUsers = await EmployeeModel.getAll({ role: [UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE] });
    if (hrUsers.length > 0) {
      const employee = await EmployeeModel.findById(userId);
      const employeeName = employee ? `${employee.firstName} ${employee.lastName}`.trim() : 'An employee';
      await db.insert(notifications).values(
        hrUsers.map(hr => ({
          userId: hr.id,
          type: 'profile_change_submitted',
          title: 'Profile change request submitted',
          message: `${employeeName} submitted a profile change request awaiting your review.`,
          payload: { requestId: created.id },
          link: `/profile-approvals?id=${created.id}`,
        }))
      );
    }

    return created;
  },

  async listMyRequests(userId: number, query: ListProfileChangeRequestsQuery) {
    return ProfileChangeRequestModel.listByUserId(userId, { status: query.status });
  },

  async listAllRequests(actorRole: UserRole, query: ListProfileChangeRequestsQuery) {
    if (!HR_ROLES.includes(actorRole)) {
      throw new ForbiddenError('Only HR can view all profile change requests');
    }
    return ProfileChangeRequestModel.listAll({ status: query.status });
  },

  // Branches like leaveService.listLeaveRequests: HR/super_admin see every
  // employee's requests (with status filter), everyone else only sees their own.
  async listRequests(userId: number, actorRole: UserRole, query: ListProfileChangeRequestsQuery) {
    if (HR_ROLES.includes(actorRole)) {
      return this.listAllRequests(actorRole, query);
    }
    return this.listMyRequests(userId, query);
  },

  async getRequestById(id: number, actorUserId: number, actorRole: UserRole) {
    const request = await ProfileChangeRequestModel.findById(id);
    if (!request) throw new NotFoundError('Profile change request not found');
    if (!HR_ROLES.includes(actorRole) && request.userId !== actorUserId) {
      throw new ForbiddenError();
    }
    return request;
  },

  async decide(
    id: number,
    actorUserId: number,
    actorRole: UserRole,
    decision: 'approved' | 'rejected' | 'returned_for_modification',
    reviewerComments?: string
  ): Promise<DrizzleProfileChangeRequest> {
    if (!HR_ROLES.includes(actorRole)) {
      throw new ForbiddenError('Only HR can decide on profile change requests');
    }

    const request = await ProfileChangeRequestModel.findById(id);
    if (!request) throw new NotFoundError('Profile change request not found');
    if (request.status !== 'pending_approval') {
      throw new BadRequestError('This request has already been decided');
    }

    const changes = (request.changes as ProfileChangeItem[]) ?? [];

    return db.transaction(async tx => {
      if (decision === 'approved') {
        const employeeRow = await tx.query.users.findFirst({ where: eq(users.id, request.userId) });
        if (!employeeRow) throw new NotFoundError('Employee not found');

        for (const item of changes) {
          if (item.entityType === 'user_field') {
            if (item.field === 'bank_account') {
              const after = item.after as BankAccountValue;
              await tx
                .update(users)
                .set({
                  bankName: after.bankName ? encryptPII(after.bankName) : null,
                  accountHolderName: after.accountHolderName ? encryptPII(after.accountHolderName) : null,
                  accountNumber: after.accountNumber ? encryptPII(after.accountNumber) : null,
                  bankBranch: after.bankBranch ? encryptPII(after.bankBranch) : null,
                })
                .where(eq(users.id, request.userId));
            } else {
              const after = item.after as string | null;
              const value = item.field === 'contactNumber' ? (after ? encryptPII(after) : null) : after;
              await tx
                .update(users)
                .set({ [item.field]: value } as Record<string, unknown>)
                .where(eq(users.id, request.userId));
            }
            await tx.insert(auditLogs).values({
              userId: actorUserId,
              action: 'profile_change_request.applied',
              tableName: 'users',
              recordId: request.userId,
              oldValues: { [item.field]: item.before } as any,
              newValues: { [item.field]: item.after } as any,
            });
          } else if (item.entityType === 'employee_pii_field') {
            if (!employeeRow.employeeId) {
              throw new BadRequestError('Employee has no employeeId; cannot update address');
            }
            const key = env.PII_ENCRYPTION_KEY;
            await tx
              .insert(employeePii)
              .values({
                employeeId: employeeRow.employeeId,
                address: sql`pgp_sym_encrypt(${item.after}, ${key})`,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: employeePii.employeeId,
                set: { address: sql`pgp_sym_encrypt(${item.after}, ${key})`, updatedAt: new Date() },
              });
            await tx.insert(auditLogs).values({
              userId: actorUserId,
              action: 'profile_change_request.applied',
              tableName: 'tbl_employee_pii',
              recordId: request.userId,
              oldValues: { address: item.before },
              newValues: { address: item.after },
            });
          } else if (item.entityType === 'education') {
            if (item.operation === 'create') {
              const [inserted] = await tx
                .insert(employeeEducation)
                .values({ userId: request.userId, ...item.after! })
                .returning();
              await tx.insert(auditLogs).values({
                userId: actorUserId,
                action: 'profile_change_request.applied',
                tableName: 'employee_education',
                recordId: inserted.id,
                oldValues: null,
                newValues: item.after as any,
              });
            } else if (item.operation === 'update') {
              await tx
                .update(employeeEducation)
                .set({ ...item.after!, updatedAt: new Date() })
                .where(eq(employeeEducation.id, item.recordId!));
              await tx.insert(auditLogs).values({
                userId: actorUserId,
                action: 'profile_change_request.applied',
                tableName: 'employee_education',
                recordId: item.recordId!,
                oldValues: item.before as any,
                newValues: item.after as any,
              });
            } else {
              await tx.delete(employeeEducation).where(eq(employeeEducation.id, item.recordId!));
              await tx.insert(auditLogs).values({
                userId: actorUserId,
                action: 'profile_change_request.applied',
                tableName: 'employee_education',
                recordId: item.recordId!,
                oldValues: item.before as any,
                newValues: null,
              });
            }
          } else if (item.entityType === 'work_history') {
            if (item.operation === 'create') {
              const [inserted] = await tx
                .insert(employeeWorkHistory)
                .values({ userId: request.userId, ...item.after! })
                .returning();
              await tx.insert(auditLogs).values({
                userId: actorUserId,
                action: 'profile_change_request.applied',
                tableName: 'employee_work_history',
                recordId: inserted.id,
                oldValues: null,
                newValues: item.after as any,
              });
            } else if (item.operation === 'update') {
              await tx
                .update(employeeWorkHistory)
                .set({ ...item.after!, updatedAt: new Date() })
                .where(eq(employeeWorkHistory.id, item.recordId!));
              await tx.insert(auditLogs).values({
                userId: actorUserId,
                action: 'profile_change_request.applied',
                tableName: 'employee_work_history',
                recordId: item.recordId!,
                oldValues: item.before as any,
                newValues: item.after as any,
              });
            } else {
              await tx.delete(employeeWorkHistory).where(eq(employeeWorkHistory.id, item.recordId!));
              await tx.insert(auditLogs).values({
                userId: actorUserId,
                action: 'profile_change_request.applied',
                tableName: 'employee_work_history',
                recordId: item.recordId!,
                oldValues: item.before as any,
                newValues: null,
              });
            }
          }
        }

        await tx
          .update(profileChangeRequests)
          .set({
            status: 'approved',
            reviewerId: actorUserId,
            reviewerComments: reviewerComments ?? null,
            decidedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(profileChangeRequests.id, id));

        await tx.insert(notifications).values({
          userId: request.userId,
          type: 'profile_change_approved',
          title: 'Profile change request approved',
          message: 'Your profile change request has been approved and your profile has been updated.',
          payload: { requestId: id },
          link: `/profile?tab=pending-changes`,
        });
      } else {
        await tx
          .update(profileChangeRequests)
          .set({
            status: decision,
            reviewerId: actorUserId,
            reviewerComments: reviewerComments ?? null,
            decidedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(profileChangeRequests.id, id));

        await tx.insert(notifications).values({
          userId: request.userId,
          type: decision === 'rejected' ? 'profile_change_rejected' : 'profile_change_returned',
          title:
            decision === 'rejected'
              ? 'Profile change request rejected'
              : 'Profile change request returned for modification',
          message: reviewerComments || 'Please review the HR comments on this request.',
          payload: { requestId: id },
          link: `/profile?tab=pending-changes`,
        });
      }

      const updated = await tx.query.profileChangeRequests.findFirst({
        where: eq(profileChangeRequests.id, id),
      });
      if (!updated) throw new NotFoundError('Profile change request not found after update');
      return updated;
    });
  },
};
