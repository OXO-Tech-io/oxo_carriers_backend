import { db } from '../db';
import { EmployeePiiModel } from '../models/EmployeePii';
import { EmployeeNomineeModel } from '../models/EmployeeNominee';
import { EmployeeDependentModel } from '../models/EmployeeDependent';
import { EmployeeEmergencyContactModel } from '../models/EmployeeEmergencyContact';
import { EmployeeWelfareInfoModel } from '../models/EmployeeWelfareInfo';
import type { CreateEmployeeProfileInput } from '../validators/employeeProfileCreation.validator';

export const employeeProfileCreationService = {
  /**
   * Writes full profile data (statutory info, nominees, remittance,
   * dependents, emergency contacts, welfare) directly for a just-created
   * employee - no change-request/approval step, since there's no "before"
   * state to diff against for a brand-new record. Mirrors the write methods
   * profileChangeRequest.service.ts already uses on approval. Caller
   * (userController.createUser) is responsible for validating the payload
   * (max nominees, dependents-requires-married) before calling this.
   */
  async applyToNewEmployee(user: { id: number; employeeId: string }, profile: CreateEmployeeProfileInput) {
    await db.transaction(async (tx) => {
      if (profile.statutory || profile.remittance || profile.bloodType) {
        await EmployeePiiModel.upsert(
          user.employeeId,
          {
            ...(profile.statutory
              ? {
                  nationalId: profile.statutory.nationalId,
                  fullNameAsNic: profile.statutory.fullNameAsNic,
                  nameWithInitials: profile.statutory.nameWithInitials,
                  addressLine1: profile.statutory.addressLine1,
                  addressLine2: profile.statutory.addressLine2 ?? null,
                  city: profile.statutory.city,
                  district: profile.statutory.district,
                  dateOfBirth: profile.statutory.dateOfBirth,
                  birthPlace: profile.statutory.birthPlace,
                  sex: profile.statutory.sex,
                  maritalStatus: profile.statutory.maritalStatus,
                  nationality: profile.statutory.nationality,
                  spouseName: profile.statutory.spouseName ?? null,
                  motherName: profile.statutory.motherName,
                  fatherName: profile.statutory.fatherName,
                }
              : {}),
            ...(profile.remittance
              ? {
                  residingAddressLine1: profile.remittance.residingAddressLine1 ?? null,
                  residingAddressLine2: profile.remittance.residingAddressLine2 ?? null,
                  residingCity: profile.remittance.residingCity ?? null,
                  residingDistrict: profile.remittance.residingDistrict ?? null,
                  landlineNumber: profile.remittance.landlineNumber ?? null,
                }
              : {}),
            ...(profile.bloodType ? { bloodType: profile.bloodType } : {}),
          },
          tx
        );
      }

      for (const nominee of profile.nominees ?? []) {
        await EmployeeNomineeModel.create(user.id, nominee, tx);
      }

      if (profile.statutory?.maritalStatus === 'married') {
        for (const dependent of profile.dependents ?? []) {
          await EmployeeDependentModel.create(user.id, dependent, tx);
        }
      }

      for (const contact of profile.emergencyContacts ?? []) {
        await EmployeeEmergencyContactModel.create(user.id, contact, tx);
      }

      if (profile.welfare) {
        await EmployeeWelfareInfoModel.upsert(user.id, profile.welfare, tx);
      }
    });
  },
};
