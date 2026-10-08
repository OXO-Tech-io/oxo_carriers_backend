import { Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeArchiveModel } from './EmployeeArchive';
import { EmployeeModel } from '../../employees/Employee';
import { EmployeePiiModel } from '../../employees/EmployeePii';
import { EmployeeNomineeModel } from '../employee-nominees/EmployeeNominee';
import { EmployeeDependentModel } from '../employee-dependents/EmployeeDependent';
import { EmployeeEmergencyContactModel } from '../employee-emergency-contacts/EmployeeEmergencyContact';
import { EmployeeWelfareInfoModel } from '../employee-welfare-info/EmployeeWelfareInfo';
import { EmployeeEducationModel } from '../employee-education/EmployeeEducation';
import { EmployeeWorkHistoryModel } from '../employee-work-history/EmployeeWorkHistory';
import type { Employee as DrizzleEmployee } from '../../db/schema';

/**
 * OCD-453: builds the full-profile JSON snapshot archived at the moment an
 * employee is deleted, and the read-side (list/detail) for Administrators to
 * review it afterwards.
 *
 * Called from UsersService.delete() BEFORE that method removes the
 * tbl_employee_pii row / disables the Keycloak account, so the snapshot
 * captures data exactly as it looked pre-deletion, including the PII fields
 * that UsersService.delete() is about to hard-delete. The other child
 * records (nominees, dependents, emergency contacts, welfare info, education,
 * work history) aren't actually removed by that flow - they just become
 * unreachable once the employee is excluded from listings - but are captured
 * here too so the archive is a complete, self-contained point-in-time record
 * that doesn't depend on those rows continuing to exist.
 */
@Injectable()
export class ArchiveService {
  async archiveEmployeeDeletion(employee: DrizzleEmployee, deletedBy: { userId: number }) {
    const employeeId = employee.employeeId;

    const [pii, nominees, dependents, emergencyContacts, welfareInfo, education, workHistory, deleter] =
      await Promise.all([
        employeeId ? EmployeePiiModel.findByEmployeeId(employeeId) : Promise.resolve(null),
        employeeId ? EmployeeNomineeModel.listByEmployeeId(employeeId) : Promise.resolve([]),
        employeeId ? EmployeeDependentModel.listByEmployeeId(employeeId) : Promise.resolve([]),
        employeeId ? EmployeeEmergencyContactModel.listByEmployeeId(employeeId) : Promise.resolve([]),
        employeeId ? EmployeeWelfareInfoModel.findByEmployeeId(employeeId) : Promise.resolve(null),
        employeeId ? EmployeeEducationModel.listByEmployeeId(employeeId) : Promise.resolve([]),
        employeeId ? EmployeeWorkHistoryModel.listByEmployeeId(employeeId) : Promise.resolve([]),
        EmployeeModel.findById(deletedBy.userId),
      ]);

    const deletedByName = deleter ? `${deleter.firstName} ${deleter.lastName}`.trim() : null;

    return EmployeeArchiveModel.create({
      employeeId: employeeId ?? '',
      employeeNumericId: employee.id,
      snapshot: {
        employee,
        personalDetails: pii,
        nominees,
        dependents,
        emergencyContacts,
        welfareInfo,
        education,
        workHistory,
      },
      deletedByEmployeeId: deletedBy.userId,
      deletedByName,
    });
  }

  // Access is gated at the controller (PermissionGuard + RequirePermission),
  // same as DocumentVaultService - not re-checked here.
  async listAll() {
    return EmployeeArchiveModel.listAll();
  }

  async getById(id: number) {
    const record = await EmployeeArchiveModel.findById(id);
    if (!record) throw new NotFoundException('Archived record not found');
    return record;
  }
}
