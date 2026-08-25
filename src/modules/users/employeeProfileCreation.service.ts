import { db } from '../../db';
import { employeeEducation, employeeWorkHistory } from '../../db/schema';
import { EmployeePiiModel } from '../../employees/EmployeePii';
import { EmployeeModel } from '../../employees/Employee';
import { EmployeeNomineeModel } from '../employee-nominees/EmployeeNominee';
import { EmployeeDependentModel } from '../employee-dependents/EmployeeDependent';
import { EmployeeEmergencyContactModel } from '../employee-emergency-contacts/EmployeeEmergencyContact';
import { EmployeeWelfareInfoModel } from '../employee-welfare-info/EmployeeWelfareInfo';
import type { CreateEmployeeProfileInput } from '../../validators/employeeProfileCreation.validator';

function hasPiiUpdates(profile: CreateEmployeeProfileInput): boolean {
  return !!(profile.statutory || profile.remittance || profile.bloodType || profile.health || profile.welfare);
}

/** Flattens the profile's statutory/remittance/health sections into the single upsert() call EmployeePiiModel expects. */
function buildPiiUpsertPayload(profile: CreateEmployeeProfileInput) {
  const { statutory, remittance, bloodType, health } = profile;
  return {
    ...(statutory
      ? {
          nationalId: statutory.nationalId,
          legalName: statutory.legalName,
          initialsName: statutory.initialsName,
          callingName: statutory.callingName ?? null,
          addressLine1: statutory.addressLine1,
          addressLine2: statutory.addressLine2 ?? null,
          city: statutory.city,
          district: statutory.district,
          birthPlace: statutory.birthPlace,
          secondaryContactNumber: statutory.secondaryContactNumber ?? null,
          spouseName: statutory.spouseName ?? null,
          spouseNic: statutory.spouseNic ?? null,
          spouseContactNumber: statutory.spouseContactNumber ?? null,
          spouseOccupation: statutory.spouseOccupation ?? null,
          motherName: statutory.motherName,
          motherOccupation: statutory.motherOccupation ?? null,
          motherContactNumber: statutory.motherContactNumber ?? null,
          fatherName: statutory.fatherName,
          fatherOccupation: statutory.fatherOccupation ?? null,
          fatherContactNumber: statutory.fatherContactNumber ?? null,
        }
      : {}),
    ...(remittance
      ? {
          residingAddressLine1: remittance.residingAddressLine1 ?? null,
          residingAddressLine2: remittance.residingAddressLine2 ?? null,
          residingCity: remittance.residingCity ?? null,
          residingDistrict: remittance.residingDistrict ?? null,
          landlineNumber: remittance.landlineNumber ?? null,
        }
      : {}),
    ...(bloodType ? { bloodType } : {}),
    ...(health
      ? {
          medicalConditions: health.medicalConditions ?? null,
          allergies: health.allergies ?? null,
        }
      : {}),
    ...(profile.welfare ? { additionalNotes: profile.welfare.additionalNotes ?? null } : {}),
  };
}

function hasEmployeeTableUpdates(profile: CreateEmployeeProfileInput): boolean {
  return !!(profile.statutory || profile.welfare || profile.declarationAccepted !== undefined);
}

/** Flattens the profile's non-PII statutory/welfare/declaration fields into the payload for EmployeeModel.update(). */
function buildEmployeeUpdatePayload(profile: CreateEmployeeProfileInput) {
  const { statutory, welfare, declarationAccepted } = profile;
  return {
    ...(statutory
      ? {
          gramaNiladariDivision: statutory.gramaNiladariDivision ?? null,
          electorate: statutory.electorate ?? null,
          postalCode: statutory.postalCode ?? null,
          dateOfBirth: statutory.dateOfBirth,
          sex: statutory.sex,
          maritalStatus: statutory.maritalStatus,
          nationality: statutory.nationality,
          religion: statutory.religion ?? null,
          spouseDateOfBirth: statutory.spouseDateOfBirth ?? null,
          siblingDetails: statutory.siblingDetails ?? null,
          primarySchool: statutory.primarySchoolAttended ?? null,
          secondarySchool: statutory.secondarySchoolAttended ?? null,
        }
      : {}),
    ...(welfare ? { linkedinProfile: welfare.linkedinProfile ?? null } : {}),
    ...(declarationAccepted !== undefined
      ? {
          declarationAccepted,
          declarationAcceptedAt: declarationAccepted ? new Date() : null,
        }
      : {}),
  };
}

export const employeeProfileCreationService = {
  /**
   * Writes full profile data (statutory info, nominees, remittance,
   * dependents, emergency contacts, welfare, education, work history)
   * directly for a just-created employee - no change-request/approval step,
   * since there's no "before" state to diff against for a brand-new record.
   * Mirrors the write methods profileChangeRequest.service.ts already uses
   * on approval. Caller (userController.createUser) is responsible for
   * validating the payload (max nominees, dependents-requires-married)
   * before calling this.
   */
  async applyToNewEmployee(user: { id: number; employeeId: string }, profile: CreateEmployeeProfileInput) {
    await db.transaction(async (tx) => {
      if (hasPiiUpdates(profile)) {
        await EmployeePiiModel.upsert(user.employeeId, buildPiiUpsertPayload(profile), tx);
      }

      if (hasEmployeeTableUpdates(profile)) {
        await EmployeeModel.update(user.id, buildEmployeeUpdatePayload(profile), tx);
      }

      for (const nominee of profile.nominees ?? []) {
        await EmployeeNomineeModel.create(user.employeeId, nominee, tx);
      }

      if (profile.statutory?.maritalStatus === 'married') {
        for (const dependent of profile.dependents ?? []) {
          await EmployeeDependentModel.create(user.employeeId, dependent, tx);
        }
      }

      for (const contact of profile.emergencyContacts ?? []) {
        await EmployeeEmergencyContactModel.create(user.employeeId, contact, tx);
      }

      if (profile.welfare) {
        await EmployeeWelfareInfoModel.upsert(
          user.employeeId,
          {
            weddingAnniversaryDate: profile.welfare.weddingAnniversaryDate ?? null,
            hobbies: profile.welfare.hobbies ?? null,
            communityActivities: profile.welfare.communityActivities ?? null,
            professionalMemberships: profile.welfare.professionalMemberships ?? null,
          },
          tx
        );
      }

      for (const education of profile.education ?? []) {
        await tx.insert(employeeEducation).values({ employeeId: user.employeeId, ...education });
      }

      for (const workHistory of profile.workHistory ?? []) {
        await tx.insert(employeeWorkHistory).values({ employeeId: user.employeeId, ...workHistory });
      }
    });
  },
};
