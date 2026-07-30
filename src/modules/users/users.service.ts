import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeModel } from '../../employees/Employee';
import { EmployeePiiModel } from '../../employees/EmployeePii';
import pool from '../../config/database';
import { calculateProRatedAnnualLeave } from '../../utils/leaveCalculation';
import { keycloakAdminService } from './keycloakAdmin.service';
import { generateSecureTemporaryPassword } from '../../utils/password';
import { employeeProfileCreationService } from './employeeProfileCreation.service';
import { createEmployeeProfileSchema } from '../../validators/employeeProfileCreation.validator';
import { UserRole, JwtPayload } from '../../types';
import { logger } from '../../lib/logger';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SELF_ONLY_ROLES = [UserRole.EMPLOYEE, UserRole.CONSULTANT, UserRole.SERVICE_PROVIDER];
const VALID_ROLES: string[] = Object.values(UserRole);

const isSuperAdmin = (employee: JwtPayload) => employee.role === UserRole.SUPER_ADMIN;

@Injectable()
export class UsersService {
  async getAll(search?: string) {
    const [kcUsers, employees] = await Promise.all([
      keycloakAdminService.listUsers({ search }),
      EmployeeModel.getAll({ search: search as any }),
    ]);

    const kcByEmail = new Map(kcUsers.map((kc) => [kc.email?.toLowerCase(), kc]));

    // Driven by the employee table, not Keycloak - an employee who was never
    // provisioned in Keycloak (or whose provisioning failed, a state the
    // create flow explicitly allows) is still a real employee and must still
    // show up here, just without Keycloak status attached.
    return employees.map((employee) => {
      const kc = kcByEmail.get(employee.email.toLowerCase());
      return {
        keycloakId: kc?.id ?? null,
        email: employee.email,
        firstName: kc?.firstName ?? employee.firstName,
        lastName: kc?.lastName ?? employee.lastName,
        enabled: kc?.enabled ?? null,
        emailVerified: kc?.emailVerified ?? null,
        requiredActions: kc?.requiredActions ?? [],
        employee,
      };
    });
  }

  async getById(userId: number, requester: JwtPayload) {
    if (SELF_ONLY_ROLES.includes(requester.role) && requester.userId !== userId) {
      throw new ForbiddenException('Forbidden');
    }
    const user = await EmployeeModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Response shape ({ success, pii }, not the { success, data } envelope used
   * elsewhere) matches what the frontend's profileService.getEmployeePii has
   * always expected from this endpoint.
   */
  async getPii(userId: number, requester: JwtPayload) {
    if (SELF_ONLY_ROLES.includes(requester.role) && requester.userId !== userId) {
      throw new ForbiddenException();
    }
    const target = await EmployeeModel.findById(userId);
    if (!target) throw new NotFoundException('Employee not found');
    return target.employeeId ? await EmployeePiiModel.findByEmployeeId(target.employeeId) : null;
  }

  async create(dto: CreateUserDto, requester: JwtPayload) {
    const canCreateUser = [UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE];
    if (!isSuperAdmin(requester) && !canCreateUser.includes(requester.role)) {
      throw new ForbiddenException(
        'Only HR can create employees. Finance can only create service providers via Create Service Provider.',
      );
    }

    const userRoleInput = dto.role || UserRole.EMPLOYEE;
    if (userRoleInput === UserRole.SERVICE_PROVIDER) {
      throw new BadRequestException('Service providers must be created via Create Service Provider.');
    }

    if (!dto.email || !dto.first_name || !dto.last_name) {
      throw new BadRequestException('Required fields are missing');
    }

    if (
      dto.role === UserRole.CONSULTANT &&
      (dto.hourly_rate == null || dto.hourly_rate === '' || isNaN(parseFloat(String(dto.hourly_rate))))
    ) {
      throw new BadRequestException('Hourly rate is required for Consultant role');
    }

    let profileInput: ReturnType<typeof createEmployeeProfileSchema.parse> | undefined;
    if (dto.profile !== undefined) {
      const profileParse = createEmployeeProfileSchema.safeParse(dto.profile);
      if (!profileParse.success) {
        throw new BadRequestException(profileParse.error.issues[0]?.message || 'Invalid profile data');
      }
      if (profileParse.data.dependents?.length && profileParse.data.statutory?.maritalStatus !== 'married') {
        throw new BadRequestException('Dependents can only be added for married employees');
      }
      profileInput = profileParse.data;
    }

    const existingUser = await EmployeeModel.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const employeeId = dto.employee_id ? dto.employee_id.trim() : await EmployeeModel.generateEmployeeId();

    if (dto.employee_id) {
      const existingEmployee = await EmployeeModel.findByEmployeeId(employeeId);
      if (existingEmployee) {
        throw new ConflictException('Employee ID already registered');
      }
    }

    const userRole = dto.role || UserRole.EMPLOYEE;

    const user = await EmployeeModel.create({
      employee_id: employeeId,
      email: dto.email,
      first_name: dto.first_name,
      last_name: dto.last_name,
      role: userRole,
      department: dto.department,
      position: dto.position,
      hire_date: dto.hire_date ? new Date(dto.hire_date) : undefined,
      manager_id: dto.manager_id ? parseInt(String(dto.manager_id)) : undefined,
      hourly_rate: dto.role === UserRole.CONSULTANT && dto.hourly_rate != null ? parseFloat(String(dto.hourly_rate)) : null,
      bank_name: dto.bank_name || null,
      account_holder_name: dto.account_holder_name || null,
      account_number: dto.account_number || null,
      bank_branch: dto.bank_branch || null,
      bank_branch_code: dto.bank_branch_code || null,
      swift_code: dto.swift_code || null,
      company_name: null,
      contact_number: dto.contact_number || null,
    });

    if (profileInput) {
      await employeeProfileCreationService.applyToNewEmployee({ id: user.id, employeeId: user.employeeId! }, profileInput);
    }

    const isLeaveEligible = userRole === UserRole.EMPLOYEE || userRole === UserRole.HR_MANAGER || userRole === UserRole.HR_EXECUTIVE;
    if (isLeaveEligible) {
      const currentYear = new Date().getFullYear();
      const leaveTypesResult = await pool.query('SELECT id, name, max_days FROM tbl_leave_types WHERE is_active = true');
      const types = leaveTypesResult.rows as any[];

      const hireDateVal = user.hireDate || (user as any).hire_date;
      const hireDate = hireDateVal ? new Date(hireDateVal) : new Date();

      for (const type of types) {
        let totalDays = type.max_days;
        if (
          type.name.toLowerCase() === 'annual' ||
          type.name.toLowerCase() === 'annual/paid leave' ||
          type.name.toLowerCase() === 'annual leave'
        ) {
          totalDays = calculateProRatedAnnualLeave(hireDate, currentYear);
        }
        await pool.query(
          'INSERT INTO tbl_employee_leave_balance (user_id, leave_type_id, total_days, used_days, remaining_days, year) VALUES ($1, $2, $3, 0, $4, $5)',
          [user.id, type.id, totalDays, totalDays, currentYear],
        );
      }
    }

    if (userRole === UserRole.EMPLOYEE) {
      const defaultPermissions = [
        'dashboard',
        'leaves',
        'salaries',
        'facilities',
        'medical_claims',
        'reports',
        'work_logs',
        'communications',
        'forms',
      ];
      for (const permission of defaultPermissions) {
        await pool.query(
          `INSERT INTO tbl_user_permissions (employee_id, permission_key, access_level) VALUES ($1, $2, $3)`,
          [user.employeeId, permission, 'read'],
        );
      }
    }

    // Auto-provision the Keycloak account so HR doesn't need a separate manual
    // step. Only a super_admin can opt an employee out (e.g. a system/shared
    // account with no individual login) via skipKeycloakProvisioning - anyone
    // else's flag is ignored and provisioning still happens. A Keycloak
    // failure here doesn't roll back the already-created employee row; HR can
    // retry via the existing manual POST /users/:id/keycloak endpoint.
    const skipProvisioning = dto.skipKeycloakProvisioning === true && isSuperAdmin(requester);
    let keycloak: { provisioned: boolean; onboardingEmailSent?: boolean } = { provisioned: false };
    if (!skipProvisioning) {
      try {
        const result = await this.provisionKeycloak(user.id);
        keycloak = { provisioned: true, onboardingEmailSent: result.onboardingEmailSent ?? true };
      } catch (kcError: any) {
        logger.error({ err: kcError, userId: user.id }, 'Failed to auto-provision Keycloak account for new employee');
      }
    }

    return { ...user, keycloak };
  }

  async update(userId: number, dto: UpdateUserDto, requester: JwtPayload) {
    if (SELF_ONLY_ROLES.includes(requester.role) && requester.userId !== userId) {
      throw new ForbiddenException('Forbidden');
    }

    const updates: any = {};
    if (dto.first_name) updates.firstName = dto.first_name;
    if (dto.last_name) updates.lastName = dto.last_name;
    if (dto.department !== undefined) updates.department = dto.department;
    if (dto.position !== undefined) updates.position = dto.position;
    if (dto.manager_id !== undefined) updates.managerId = dto.manager_id ? parseInt(String(dto.manager_id)) : null;

    const canUpdateRole =
      isSuperAdmin(requester) || requester.role === UserRole.HR_MANAGER || requester.role === UserRole.HR_EXECUTIVE;
    if (canUpdateRole && dto.role) {
      updates.role = dto.role;
    }

    const user = await EmployeeModel.update(userId, updates);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async delete(userId: number, requester: JwtPayload) {
    const canDelete = isSuperAdmin(requester) || requester.role === UserRole.HR_MANAGER;
    if (!canDelete) {
      throw new ForbiddenException('Only HR Manager or Super Admin can delete users');
    }
    if (requester.userId === userId) {
      throw new BadRequestException('Cannot delete your own account');
    }

    const user = await EmployeeModel.findById(userId);
    await EmployeeModel.delete(userId);

    if (user?.keycloakSub) {
      try {
        await keycloakAdminService.deleteUser(user.keycloakSub);
      } catch (kcError: any) {
        logger.error({ err: kcError, userId }, 'Failed to delete Keycloak user after user deletion');
      }
    }
  }

  async resetPassword(userId: number, requester: JwtPayload) {
    const canReset =
      isSuperAdmin(requester) || requester.role === UserRole.HR_MANAGER || requester.role === UserRole.HR_EXECUTIVE;
    if (!canReset) {
      throw new ForbiddenException('Only HR or Super Admin can reset passwords');
    }

    logger.info({ userId }, 'Admin initiating password reset');
    const user = await EmployeeModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (!user.keycloakSub) {
      throw new ConflictException('User is not provisioned in Keycloak yet, so their password cannot be reset.');
    }

    try {
      await keycloakAdminService.sendRequiredActionsEmail(user.keycloakSub, ['UPDATE_PASSWORD']);
      logger.info({ email: user.email }, 'Keycloak password reset email sent');
    } catch (emailError: any) {
      logger.error({ err: emailError }, 'Error sending Keycloak password reset email');
      // Matches the original controller's 502 (bad gateway to Keycloak).
      throw new HttpException(
        'Failed to send reset email via Keycloak. Verify the realm SMTP settings are configured.',
        502,
      );
    }
  }

  async getDepartments() {
    const result = await pool.query(
      'SELECT DISTINCT department FROM tbl_employee WHERE department IS NOT NULL ORDER BY department',
    );
    return (result.rows as any[]).map((row) => row.department);
  }

  async updateRole(userId: number, role: string, requester: JwtPayload) {
    if (!isSuperAdmin(requester)) {
      throw new ForbiddenException('Only Super Admin can change user roles');
    }
    if (isNaN(userId)) {
      throw new BadRequestException('Invalid user ID');
    }
    if (requester.userId === userId) {
      throw new BadRequestException('Cannot change your own role');
    }
    if (!role || !VALID_ROLES.includes(role)) {
      throw new BadRequestException(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
    }

    const targetUser = await EmployeeModel.findById(userId);
    if (!targetUser) throw new NotFoundException('User not found');

    const previousRole = targetUser.role;
    const updated = await EmployeeModel.update(userId, { role: role as UserRole });
    if (!updated) {
      throw new BadRequestException('Failed to update role');
    }

    logger.info(
      { actorId: requester.userId, targetUserId: userId, previousRole, newRole: role },
      'Super Admin changed user role',
    );

    return { id: userId, previous_role: previousRole, new_role: role };
  }

  async provisionKeycloak(userId: number) {
    const user = await EmployeeModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (user.keycloakSub) {
      return { alreadyProvisioned: true as const, keycloakSub: user.keycloakSub };
    }

    const tempPassword = generateSecureTemporaryPassword();

    logger.info({ userId, email: user.email }, 'Provisioning user in Keycloak...');

    const kcSub = await keycloakAdminService.createUser({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      password: tempPassword,
      temporaryPassword: true,
      role: user.role as UserRole,
    });

    await EmployeeModel.linkKeycloakSub(user.id, kcSub);
    logger.info({ userId, kcSub }, 'Keycloak user provisioned and linked successfully.');

    let onboardingEmailSent = true;
    try {
      await keycloakAdminService.sendRequiredActionsEmail(kcSub, ['VERIFY_EMAIL', 'UPDATE_PASSWORD']);
      logger.info({ email: user.email }, 'Keycloak onboarding email sent');
    } catch (emailError: any) {
      onboardingEmailSent = false;
      logger.error({ err: emailError }, 'Failed to send Keycloak onboarding email');
    }

    return { alreadyProvisioned: false as const, keycloakSub: kcSub, onboardingEmailSent };
  }
}
