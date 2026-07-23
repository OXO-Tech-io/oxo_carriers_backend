import { db } from '../db';
import { employee, userPermissions, type Employee as DrizzleEmployee } from '../db/schema';
import { User, UserRole } from '../types';
import { eq, like, or, and, sql, inArray } from 'drizzle-orm';
import { encryptPII, decryptPII } from '../utils/encryption';

function decryptUser(user: DrizzleEmployee | null): DrizzleEmployee | null {
  if (!user) return null;
  return {
    ...user,
    hourlyRate: user.hourlyRate ? decryptPII(user.hourlyRate) : null,
    bankName: user.bankName ? decryptPII(user.bankName) : null,
    accountHolderName: user.accountHolderName ? decryptPII(user.accountHolderName) : null,
    accountNumber: user.accountNumber ? decryptPII(user.accountNumber) : null,
    bankBranch: user.bankBranch ? decryptPII(user.bankBranch) : null,
    companyName: user.companyName ? decryptPII(user.companyName) : null,
    contactNumber: user.contactNumber ? decryptPII(user.contactNumber) : null,
  };
}

export class EmployeeModel {
  static async findByEmail(email: string): Promise<DrizzleEmployee | null> {
    const user = await db.query.employee.findFirst({
      where: eq(employee.email, email),
    });
    return decryptUser(user || null);
  }

  static async findById(id: number): Promise<DrizzleEmployee | null> {
    const user = await db.query.employee.findFirst({
      where: eq(employee.id, id),
    });
    return decryptUser(user || null);
  }

  static async findByKeycloakSub(sub: string): Promise<DrizzleEmployee | null> {
    const user = await db.query.employee.findFirst({
      where: eq(employee.keycloakSub, sub),
    });
    return decryptUser(user || null);
  }

  static async linkKeycloakSub(userId: number, sub: string): Promise<void> {
    await db
      .update(employee)
      .set({ keycloakSub: sub })
      .where(eq(employee.id, userId));
  }

  static async findOrCreateFromKeycloak(claims: {
    sub: string;
    email: string;
    first_name: string;
    last_name: string;
    role: UserRole;
  }): Promise<DrizzleEmployee> {
    const bySub = await this.findByKeycloakSub(claims.sub);
    if (bySub) return bySub;

    const byEmail = await this.findByEmail(claims.email);
    if (byEmail) {
      await this.linkKeycloakSub(byEmail.id, claims.sub);
      return { ...byEmail, keycloakSub: claims.sub };
    }

    const employeeId = await this.generateEmployeeId();
    const [insertedUser] = await db
      .insert(employee)
      .values({
        employeeId,
        email: claims.email,
        keycloakSub: claims.sub,
        firstName: claims.first_name || claims.email.split('@')[0],
        lastName: claims.last_name || '',
        role: claims.role,
        emailVerified: true,
      })
      .returning();

    if (!insertedUser) throw new Error('Failed to create user from Keycloak claims');

    // Initialize default permissions for employee role
    if (claims.role === UserRole.EMPLOYEE) {
      const defaultPermissions = [
        'dashboard',
        'leaves',
        'salaries',
        'facilities',
        'medical_claims',
        'reports',
        'profile_change_requests',
        'work_logs',
        'communications',
        'forms',
      ];
      for (const permission of defaultPermissions) {
        await db.insert(userPermissions).values({
          userId: insertedUser.id,
          permissionKey: permission,
          accessLevel: 'read',
        });
      }
    }

    return decryptUser(insertedUser) as DrizzleEmployee;
  }

  static async findByEmployeeId(employeeId: string): Promise<DrizzleEmployee | null> {
    const user = await db.query.employee.findFirst({
      where: eq(employee.employeeId, employeeId),
    });
    return decryptUser(user || null);
  }

  static async findByVerificationToken(token: string): Promise<DrizzleEmployee | null> {
    const user = await db.query.employee.findFirst({
      where: eq(employee.emailVerificationToken, token),
    });
    return decryptUser(user || null);
  }

  static async verifyEmail(userId: number): Promise<void> {
    await db
      .update(employee)
      .set({
        emailVerified: true,
        emailVerificationToken: null,
      })
      .where(eq(employee.id, userId));
  }

  static async create(userData: {
    employee_id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: UserRole;
    employee_type_id?: number | null;
    department?: string;
    position?: string;
    hire_date?: Date;
    manager_id?: number;
    hourly_rate?: number | null;
    bank_name?: string | null;
    account_holder_name?: string | null;
    account_number?: string | null;
    bank_branch?: string | null;
    bank_branch_code?: string | null;
    swift_code?: string | null;
    company_name?: string | null;
    contact_number?: string | null;
    email_verification_token?: string;
  }): Promise<DrizzleEmployee> {
    const [insertedUser] = await db
      .insert(employee)
      .values({
        employeeId: userData.employee_id,
        email: userData.email,
        firstName: userData.first_name,
        lastName: userData.last_name,
        role: userData.role,
        employeeTypeId: userData.employee_type_id ?? null,
        department: userData.department || null,
        position: userData.position || null,
        hireDate: userData.hire_date ? userData.hire_date.toISOString().split('T')[0] : null,
        managerId: userData.manager_id || null,
        hourlyRate: encryptPII(userData.hourly_rate?.toString()) ?? null,
        bankName: encryptPII(userData.bank_name) ?? null,
        accountHolderName: encryptPII(userData.account_holder_name) ?? null,
        accountNumber: encryptPII(userData.account_number) ?? null,
        bankBranch: encryptPII(userData.bank_branch) ?? null,
        bankBranchCode: encryptPII(userData.bank_branch_code) ?? null,
        swiftCode: encryptPII(userData.swift_code) ?? null,
        companyName: encryptPII(userData.company_name) ?? null,
        contactNumber: encryptPII(userData.contact_number) ?? null,
        emailVerified: false,
        emailVerificationToken: userData.email_verification_token || null,
      })
      .returning();

    if (!insertedUser) {
      throw new Error('Failed to create user');
    }
    return decryptUser(insertedUser) as DrizzleEmployee;
  }

  static async update(id: number, updates: Partial<DrizzleEmployee>): Promise<DrizzleEmployee | null> {
    // Filter out undefined values and restricted fields
    const filteredUpdates: any = {};
    const piiFields = [
      'hourlyRate',
      'bankName',
      'accountHolderName',
      'accountNumber',
      'bankBranch',
      'bankBranchCode',
      'swiftCode',
      'companyName',
      'contactNumber'
    ];
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id' && key !== 'createdAt') {
        if (piiFields.includes(key)) {
          filteredUpdates[key] = value !== null ? encryptPII(value as string) : null;
        } else {
          filteredUpdates[key] = value;
        }
      }
    });

    if (Object.keys(filteredUpdates).length === 0) {
      return await this.findById(id);
    }

    await db
      .update(employee)
      .set(filteredUpdates)
      .where(eq(employee.id, id));

    return await this.findById(id);
  }

  static async getAll(filters?: {
    role?: UserRole | UserRole[];
    department?: string;
    search?: string;
  }): Promise<DrizzleEmployee[]> {
    const conditions = [];

    if (filters?.role) {
      conditions.push(
        Array.isArray(filters.role)
          ? inArray(employee.role, filters.role)
          : eq(employee.role, filters.role)
      );
    }

    if (filters?.department) {
      conditions.push(eq(employee.department, filters.department));
    }

    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          like(employee.firstName, searchTerm),
          like(employee.lastName, searchTerm),
          like(employee.email, searchTerm),
          like(employee.employeeId, searchTerm)
        )
      );
    }

    const allUsers = await db.query.employee.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: (employee, { desc }) => [desc(employee.createdAt)],
    });

    return allUsers.map(user => decryptUser(user)) as DrizzleEmployee[];
  }

  static async delete(id: number): Promise<void> {
    await db.delete(employee).where(eq(employee.id, id));
  }

  static async generateEmployeeId(): Promise<string> {
    const year = new Date().getFullYear();
    const pattern = `EMP${year}%`;

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(employee)
      .where(like(employee.employeeId, pattern));

    const count = result[0]?.count || 0;
    const sequence = String(Number(count) + 1).padStart(4, '0');
    return `EMP${year}${sequence}`;
  }
}
