import { eq } from 'drizzle-orm';
import { db } from '../db';
import {
  users,
  employeeEducation,
  employeeWorkHistory,
  profileChangeRequests,
  auditLogs,
  notifications,
  type ProfileChangeRequest as DrizzleProfileChangeRequest,
} from '../db/schema';
import { ProfileChangeRequestModel } from '../models/ProfileChangeRequest';
import { EmployeePiiModel } from '../models/EmployeePii';
import { EmployeeNomineeModel } from '../models/EmployeeNominee';
import { EmployeeDependentModel } from '../models/EmployeeDependent';
import { EmployeeEmergencyContactModel } from '../models/EmployeeEmergencyContact';
import { EmployeeWelfareInfoModel } from '../models/EmployeeWelfareInfo';
import { UserModel } from '../models/User';
import { UserRole } from '../types';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/AppError';
import { encryptPII } from '../utils/encryption';
import type {
  AddressValue,
  BankAccountValue,
  DependentValue,
  EmergencyContactRecordValue,
  ListProfileChangeRequestsQuery,
  NomineeValue,
  ProfileChangeItem,
  SubmitProfileChangeRequestInput,
} from '../validators/profileChangeRequest.validator';

const HR_ROLES: UserRole[] = [UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE, UserRole.SUPER_ADMIN];
const MAX_NOMINEES = 2;

const PII_FIELD_LABELS: Record<string, string> = {
  address: 'Permanent Address',
  residing_address: 'Residing Address',
  blood_type: 'Blood Type',
  full_name_as_nic: 'Full Name as in NIC',
  name_with_initials: 'Name with Initials',
  date_of_birth: 'Date of Birth',
  birth_place: 'Birth Place',
  sex: 'Sex',
  marital_status: 'Marital Status',
  nationality: 'Nationality',
  spouse_name: 'Spouse Name',
  mother_name: 'Mother Name',
  father_name: 'Father Name',
  landline_number: 'Landline Number',
  national_id: 'National Identity Card Number',
};

const WELFARE_FIELD_LABELS: Record<string, string> = {
  anniversary_date: 'Wedding Anniversary Date',
  hobbies: 'Hobbies',
  community_activities: 'Community Activities',
  professional_memberships: 'Professional Memberships',
};

const summarizeChanges = (changes: ProfileChangeItem[]): string[] =>
  changes.map(item => {
    if (item.entityType === 'user_field') return item.field === 'bank_account' ? 'Bank Account' : item.field;
    if (item.entityType === 'employee_pii_field') return PII_FIELD_LABELS[item.field] ?? item.field;
    if (item.entityType === 'welfare_field') return WELFARE_FIELD_LABELS[item.field] ?? item.field;
    if (item.entityType === 'education') return `Education (${item.operation})`;
    if (item.entityType === 'work_history') return `Work History (${item.operation})`;
    if (item.entityType === 'nominee') return `Nominee (${item.operation})`;
    if (item.entityType === 'dependent') return `Dependent (${item.operation})`;
    return `Emergency Contact (${item.operation})`;
  });

// Maps a scalar employee_pii_field/welfare_field name to the key EmployeePiiModel
// .upsert()/EmployeeWelfareInfoModel.upsert() expects - keeps the change-request
// wire format (snake_case, matching the validator) decoupled from the model's
// camelCase columns.
const PII_SCALAR_FIELD_TO_MODEL_KEY: Record<string, string> = {
  blood_type: 'bloodType',
  full_name_as_nic: 'fullNameAsNic',
  name_with_initials: 'nameWithInitials',
  date_of_birth: 'dateOfBirth',
  birth_place: 'birthPlace',
  sex: 'sex',
  marital_status: 'maritalStatus',
  nationality: 'nationality',
  spouse_name: 'spouseName',
  mother_name: 'motherName',
  father_name: 'fatherName',
  landline_number: 'landlineNumber',
  national_id: 'nationalId',
};

const WELFARE_FIELD_TO_MODEL_KEY: Record<string, string> = {
  anniversary_date: 'weddingAnniversaryDate',
  hobbies: 'hobbies',
  community_activities: 'communityActivities',
  professional_memberships: 'professionalMemberships',
};

type TxExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function applyNomineeChange(
  tx: TxExecutor,
  userId: number,
  actorUserId: number,
  item: Extract<ProfileChangeItem, { entityType: 'nominee' }>
) {
  if (item.operation === 'create') {
    const after = item.after as NomineeValue;
    const inserted = await EmployeeNomineeModel.create(userId, after, tx);
    await tx.insert(auditLogs).values({
      userId: actorUserId,
      action: 'profile_change_request.applied',
      tableName: 'employee_nominees',
      recordId: inserted.id,
      oldValues: null,
      newValues: after as any,
    });
  } else if (item.operation === 'update') {
    const after = item.after as NomineeValue;
    await EmployeeNomineeModel.update(item.recordId!, after, tx);
    await tx.insert(auditLogs).values({
      userId: actorUserId,
      action: 'profile_change_request.applied',
      tableName: 'employee_nominees',
      recordId: item.recordId!,
      oldValues: item.before as any,
      newValues: after as any,
    });
  } else {
    await EmployeeNomineeModel.delete(item.recordId!, tx);
    await tx.insert(auditLogs).values({
      userId: actorUserId,
      action: 'profile_change_request.applied',
      tableName: 'employee_nominees',
      recordId: item.recordId!,
      oldValues: item.before as any,
      newValues: null,
    });
  }
}

async function applyDependentChange(
  tx: TxExecutor,
  userId: number,
  actorUserId: number,
  item: Extract<ProfileChangeItem, { entityType: 'dependent' }>,
  effectiveMaritalStatus: 'married' | 'single' | null
) {
  if ((item.operation === 'create' || item.operation === 'update') && effectiveMaritalStatus !== 'married') {
    throw new BadRequestError('Dependents can only be added or edited while marital status is Married');
  }
  if (item.operation === 'create') {
    const after = item.after as DependentValue;
    const inserted = await EmployeeDependentModel.create(userId, after, tx);
    await tx.insert(auditLogs).values({
      userId: actorUserId,
      action: 'profile_change_request.applied',
      tableName: 'employee_dependents',
      recordId: inserted.id,
      oldValues: null,
      newValues: after as any,
    });
  } else if (item.operation === 'update') {
    const after = item.after as DependentValue;
    await EmployeeDependentModel.update(item.recordId!, after, tx);
    await tx.insert(auditLogs).values({
      userId: actorUserId,
      action: 'profile_change_request.applied',
      tableName: 'employee_dependents',
      recordId: item.recordId!,
      oldValues: item.before as any,
      newValues: after as any,
    });
  } else {
    await EmployeeDependentModel.delete(item.recordId!, tx);
    await tx.insert(auditLogs).values({
      userId: actorUserId,
      action: 'profile_change_request.applied',
      tableName: 'employee_dependents',
      recordId: item.recordId!,
      oldValues: item.before as any,
      newValues: null,
    });
  }
}

async function applyEmergencyContactChange(
  tx: TxExecutor,
  userId: number,
  actorUserId: number,
  item: Extract<ProfileChangeItem, { entityType: 'emergency_contact_record' }>
) {
  if (item.operation === 'create') {
    const after = item.after as EmergencyContactRecordValue;
    const inserted = await EmployeeEmergencyContactModel.create(userId, after, tx);
    await tx.insert(auditLogs).values({
      userId: actorUserId,
      action: 'profile_change_request.applied',
      tableName: 'employee_emergency_contacts',
      recordId: inserted.id,
      oldValues: null,
      newValues: after as any,
    });
  } else if (item.operation === 'update') {
    const after = item.after as EmergencyContactRecordValue;
    await EmployeeEmergencyContactModel.update(item.recordId!, after, tx);
    await tx.insert(auditLogs).values({
      userId: actorUserId,
      action: 'profile_change_request.applied',
      tableName: 'employee_emergency_contacts',
      recordId: item.recordId!,
      oldValues: item.before as any,
      newValues: after as any,
    });
  } else {
    await EmployeeEmergencyContactModel.delete(item.recordId!, tx);
    await tx.insert(auditLogs).values({
      userId: actorUserId,
      action: 'profile_change_request.applied',
      tableName: 'employee_emergency_contacts',
      recordId: item.recordId!,
      oldValues: item.before as any,
      newValues: null,
    });
  }
}

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

    const hrUsers = await UserModel.getAll({ role: [UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE] });
    if (hrUsers.length > 0) {
      const employee = await UserModel.findById(userId);
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

        // Tab C (dependents) is only meaningful while married - resolve using
        // the current PII row, unless this same bundle is also setting
        // marital_status, in which case the new value takes effect immediately.
        let effectiveMaritalStatus: 'married' | 'single' | null = null;
        if (employeeRow.employeeId) {
          const currentPii = await EmployeePiiModel.findByEmployeeId(employeeRow.employeeId, tx);
          effectiveMaritalStatus = (currentPii?.maritalStatus as 'married' | 'single' | null) ?? null;
        }
        const maritalStatusChange = changes.find(
          c => c.entityType === 'employee_pii_field' && c.field === 'marital_status'
        );
        if (maritalStatusChange) {
          effectiveMaritalStatus = maritalStatusChange.after as 'married' | 'single' | null;
        }

        // Nominees are capped at 2 per employee (service-level, not DB-level).
        const nomineeCreates = changes.filter(c => c.entityType === 'nominee' && c.operation === 'create').length;
        const nomineeDeletes = changes.filter(c => c.entityType === 'nominee' && c.operation === 'delete').length;
        if (nomineeCreates > 0) {
          const existingNomineeCount = await EmployeeNomineeModel.countByUserId(request.userId, tx);
          if (existingNomineeCount + nomineeCreates - nomineeDeletes > MAX_NOMINEES) {
            throw new BadRequestError(`An employee can have at most ${MAX_NOMINEES} nominees`);
          }
        }

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
                  bankBranchCode: after.bankBranchCode ? encryptPII(after.bankBranchCode) : null,
                  swiftCode: after.swiftCode ? encryptPII(after.swiftCode) : null,
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
              throw new BadRequestError('Employee has no employeeId; cannot update contact details');
            }
            if (item.field === 'address') {
              const after = item.after as AddressValue;
              await EmployeePiiModel.upsert(
                employeeRow.employeeId,
                {
                  addressLine1: after.addressLine1,
                  addressLine2: after.addressLine2,
                  city: after.city,
                  district: after.district,
                },
                tx
              );
            } else if (item.field === 'residing_address') {
              // after may be null - clears the residing address back to
              // "same as permanent".
              const after = item.after as AddressValue | null;
              await EmployeePiiModel.upsert(
                employeeRow.employeeId,
                {
                  residingAddressLine1: after?.addressLine1 ?? null,
                  residingAddressLine2: after?.addressLine2 ?? null,
                  residingCity: after?.city ?? null,
                  residingDistrict: after?.district ?? null,
                },
                tx
              );
            } else {
              const scalarKey = PII_SCALAR_FIELD_TO_MODEL_KEY[item.field];
              await EmployeePiiModel.upsert(employeeRow.employeeId, { [scalarKey]: item.after } as any, tx);
            }
            await tx.insert(auditLogs).values({
              userId: actorUserId,
              action: 'profile_change_request.applied',
              tableName: 'tbl_employee_pii',
              recordId: request.userId,
              oldValues: { [item.field]: item.before } as any,
              newValues: { [item.field]: item.after } as any,
            });
          } else if (item.entityType === 'nominee') {
            await applyNomineeChange(tx, request.userId, actorUserId, item);
          } else if (item.entityType === 'dependent') {
            await applyDependentChange(tx, request.userId, actorUserId, item, effectiveMaritalStatus);
          } else if (item.entityType === 'emergency_contact_record') {
            await applyEmergencyContactChange(tx, request.userId, actorUserId, item);
          } else if (item.entityType === 'welfare_field') {
            await EmployeeWelfareInfoModel.upsert(request.userId, { [WELFARE_FIELD_TO_MODEL_KEY[item.field]]: item.after }, tx);
            await tx.insert(auditLogs).values({
              userId: actorUserId,
              action: 'profile_change_request.applied',
              tableName: 'employee_welfare_info',
              recordId: request.userId,
              oldValues: { [item.field]: item.before } as any,
              newValues: { [item.field]: item.after } as any,
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
