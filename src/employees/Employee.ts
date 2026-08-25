import { db } from '../db';
import { employee, userPermissions, type Employee as DrizzleEmployee } from '../db/schema';
import { User, UserRole } from '../types';
import { eq, like, and, sql, inArray, isNull } from 'drizzle-orm';
import { encryptPII, decryptPII, hashEmail } from '../utils/encryption';

function decryptUser(user: DrizzleEmployee | null): DrizzleEmployee | null {
  if (!user) return null;
  return {
    ...user,
    email: user.email ? decryptPII(user.email)! : user.email,
    firstName: user.firstName ? decryptPII(user.firstName)! : user.firstName,
    lastName: user.lastName ? decryptPII(user.lastName)! : user.lastName,
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
      where: eq(employee.emailHash, hashEmail(email)),
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
        email: encryptPII(claims.email)!,
        emailHash: hashEmail(claims.email),
        keycloakSub: claims.sub,
        firstName: encryptPII(claims.first_name || claims.email.split('@')[0])!,
        lastName: encryptPII(claims.last_name || '')!,
        role: claims.role,
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
        'document_vault',
      ];
      for (const permission of defaultPermissions) {
        await db.insert(userPermissions).values({
          employeeId,
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

  /** Bulk lookup by internal numeric id - used to resolve numeric id lists
   * (e.g. recipient pickers that still work in terms of internal ids) to the
   * business employeeId needed for FK columns like tbl_notifications.employee_id. */
  static async findByIds(ids: number[]): Promise<DrizzleEmployee[]> {
    if (!ids.length) return [];
    const users = await db.query.employee.findMany({
      where: inArray(employee.id, ids),
    });
    return users.map(user => decryptUser(user)) as DrizzleEmployee[];
  }

  /** Bulk lookup by business employeeId, returned as a Map for O(1) stitching.
   * Since first_name/last_name/email are encrypted, any raw-SQL join that
   * used to select them straight off tbl_employee must instead select only
   * employee_id from the join, batch-resolve the distinct ids through here,
   * and merge the decrypted name/email back onto each row. */
  static async findByEmployeeIds(employeeIds: Array<string | null | undefined>): Promise<Map<string, DrizzleEmployee>> {
    const unique = [...new Set(employeeIds.filter((id): id is string => !!id))];
    if (!unique.length) return new Map();
    const users = await db.query.employee.findMany({
      where: inArray(employee.employeeId, unique),
    });
    const map = new Map<string, DrizzleEmployee>();
    for (const user of users) {
      const decrypted = decryptUser(user) as DrizzleEmployee;
      if (decrypted.employeeId) map.set(decrypted.employeeId, decrypted);
    }
    return map;
  }

  static async create(employeeData: {
    employee_id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: UserRole;
    employee_type_id?: number | null;
    employee_category?: string | null;
    department?: string;
    position?: string;
    work_location?: string | null;
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
  }): Promise<DrizzleEmployee> {
    const [insertedUser] = await db
      .insert(employee)
      .values({
        employeeId: employeeData.employee_id,
        email: encryptPII(employeeData.email)!,
        emailHash: hashEmail(employeeData.email),
        firstName: encryptPII(employeeData.first_name)!,
        lastName: encryptPII(employeeData.last_name)!,
        role: employeeData.role,
        employeeTypeId: employeeData.employee_type_id ?? null,
        employeeCategory: (employeeData.employee_category ?? null) as 'internal' | 'client_side' | null,
        department: employeeData.department || null,
        position: employeeData.position || null,
        workLocation: (employeeData.work_location || null) as 'office' | 'remote' | 'hybrid' | null,
        hireDate: employeeData.hire_date ? employeeData.hire_date.toISOString().split('T')[0] : null,
        managerId: employeeData.manager_id || null,
        hourlyRate: encryptPII(employeeData.hourly_rate?.toString()) ?? null,
        bankName: encryptPII(employeeData.bank_name) ?? null,
        accountHolderName: encryptPII(employeeData.account_holder_name) ?? null,
        accountNumber: encryptPII(employeeData.account_number) ?? null,
        bankBranch: encryptPII(employeeData.bank_branch) ?? null,
        bankBranchCode: encryptPII(employeeData.bank_branch_code) ?? null,
        swiftCode: encryptPII(employeeData.swift_code) ?? null,
        companyName: encryptPII(employeeData.company_name) ?? null,
        contactNumber: encryptPII(employeeData.contact_number) ?? null,
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
      'email',
      'firstName',
      'lastName',
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

    // email is not nullable and its uniqueness is enforced via emailHash, not
    // the (now non-deterministic) ciphertext column - recompute the hash
    // whenever the plaintext email is changing.
    if (typeof updates.email === 'string') {
      filteredUpdates.emailHash = hashEmail(updates.email);
    }

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
    // Removed employees (UsersService.delete) are excluded by default - the
    // row is kept for FK integrity (leave, salary, attendance, etc.) but
    // shouldn't reappear in listings. Distinct from `status: 'inactive'`,
    // which HR also sets for employees who are still employed but on hold.
    const conditions = [isNull(employee.deletedAt)];

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

    // firstName/lastName/email are encrypted (non-deterministic ciphertext),
    // so a SQL-level LIKE can't match them - the whole `search` filter
    // (including employeeId, for consistency) is applied below in
    // application code, after decrypting each row.
    const allUsers = await db.query.employee.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: (employee, { desc }) => [desc(employee.createdAt)],
    });

    const decrypted = allUsers.map(user => decryptUser(user)) as DrizzleEmployee[];

    if (!filters?.search) {
      return decrypted;
    }

    const term = filters.search.toLowerCase();
    return decrypted.filter(user =>
      user.firstName?.toLowerCase().includes(term) ||
      user.lastName?.toLowerCase().includes(term) ||
      user.email?.toLowerCase().includes(term) ||
      user.employeeId?.toLowerCase().includes(term)
    );
  }

  static async delete(id: number): Promise<void> {
    await db.delete(employee).where(eq(employee.id, id));
  }

  static async generateEmployeeId(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `EMP${year}`;

    // Derived from the highest existing id, not a row count - a count desyncs
    // from the real sequence whenever an id matching this pattern was
    // inserted out of band (e.g. add_super_admin_employee.sql), permanently
    // colliding with the same already-taken id on every future call since a
    // successful insert is the only thing that would otherwise advance it.
    const result = await db
      .select({ maxId: sql<string | null>`max(${employee.employeeId})` })
      .from(employee)
      .where(like(employee.employeeId, `${prefix}%`));

    const maxId = result[0]?.maxId;
    const lastSequence = maxId ? parseInt(maxId.slice(prefix.length), 10) || 0 : 0;
    const sequence = String(lastSequence + 1).padStart(4, '0');
    return `${prefix}${sequence}`;
  }
}
