import { db } from '../db';
import { users, userPermissions, type User as DrizzleUser } from '../db/schema';
import { User, UserRole } from '../types';
import bcrypt from 'bcryptjs';
import { eq, like, or, and, sql, inArray } from 'drizzle-orm';
import { encryptPII, decryptPII } from '../utils/encryption';

export function decryptUserPII<T extends Record<string, any>>(user: T): T;
export function decryptUserPII<T extends Record<string, any>>(user: T | null): T | null;
export function decryptUserPII<T extends Record<string, any>>(user: T | undefined): T | undefined;
export function decryptUserPII<T extends Record<string, any>>(user: T | null | undefined): T | null | undefined {
  if (!user) return user;
  const result: any = { ...user };
  const fields = [
    ['firstName', 'first_name'],
    ['lastName', 'last_name'],
    ['email', 'email'],
    ['contactNumber', 'contact_number'],
    ['bankName', 'bank_name'],
    ['accountHolderName', 'account_holder_name'],
    ['accountNumber', 'account_number'],
    ['bankBranch', 'bank_branch'],
    ['bankBranchCode', 'bank_branch_code'],
    ['swiftCode', 'swift_code'],
  ];

  for (const [camel, snake] of fields) {
    if (result[camel] && typeof result[camel] === 'string') {
      result[camel] = decryptPII(result[camel]) ?? result[camel];
    }
    if (result[snake] && typeof result[snake] === 'string') {
      result[snake] = decryptPII(result[snake]) ?? result[snake];
    }
  }
  return result as T;
}

export class UserModel {
  static async findByEmail(email: string): Promise<DrizzleUser | null> {
    const targetEmail = email.toLowerCase().trim();
    // 1. Try direct database query match first
    const directUser = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (directUser) {
      return decryptUserPII(directUser);
    }

    // 2. If not found by raw string (due to PII encryption on email column), scan users to match decrypted email
    const allUsers = await db.query.users.findMany();
    for (const u of allUsers) {
      const decrypted = decryptUserPII(u);
      if (decrypted && decrypted.email && decrypted.email.toLowerCase().trim() === targetEmail) {
        return decrypted;
      }
    }
    return null;
  }

  static async findById(id: number): Promise<Omit<DrizzleUser, 'password'> | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
      columns: {
        password: false, // Exclude password from result
      },
    });
    return user ? decryptUserPII(user) : null;
  }

  static async findByKeycloakSub(sub: string): Promise<DrizzleUser | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.keycloakSub, sub),
    });
    return user ? decryptUserPII(user) : null;
  }

  static async linkKeycloakSub(userId: number, sub: string): Promise<void> {
    await db
      .update(users)
      .set({ keycloakSub: sub })
      .where(eq(users.id, userId));
  }

  static async findOrCreateFromKeycloak(claims: {
    sub: string;
    email: string;
    first_name: string;
    last_name: string;
    role: UserRole;
  }): Promise<DrizzleUser> {
    const bySub = await this.findByKeycloakSub(claims.sub);
    if (bySub) return bySub;

    const byEmail = await this.findByEmail(claims.email);
    if (byEmail) {
      await this.linkKeycloakSub(byEmail.id, claims.sub);
      return { ...byEmail, keycloakSub: claims.sub };
    }

    const employeeId = await this.generateEmployeeId();
    const [insertedUser] = await db
      .insert(users)
      .values({
        employeeId,
        email: encryptPII(claims.email) || claims.email,
        keycloakSub: claims.sub,
        firstName: encryptPII(claims.first_name || claims.email.split('@')[0]) || claims.first_name,
        lastName: encryptPII(claims.last_name || '') || claims.last_name,
        role: claims.role,
        mustChangePassword: false,
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

    return decryptUserPII(insertedUser)!;
  }

  static async findByEmployeeId(employeeId: string): Promise<DrizzleUser | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.employeeId, employeeId),
    });
    return user ? decryptUserPII(user) : null;
  }

  static async findByVerificationToken(token: string): Promise<DrizzleUser | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.emailVerificationToken, token),
    });
    return user ? decryptUserPII(user) : null;
  }

  static async verifyEmail(userId: number): Promise<void> {
    await db
      .update(users)
      .set({
        emailVerified: true,
        emailVerificationToken: null,
      })
      .where(eq(users.id, userId));
  }

  static async create(userData: {
    employee_id: string;
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    role: UserRole;
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
  }): Promise<DrizzleUser> {
    const hashedPassword = await bcrypt.hash(userData.password || 'password123', 10);

    const [insertedUser] = await db
      .insert(users)
      .values({
        employeeId: userData.employee_id,
        email: encryptPII(userData.email) || userData.email,
        password: hashedPassword,
        firstName: encryptPII(userData.first_name) || userData.first_name,
        lastName: encryptPII(userData.last_name) || userData.last_name,
        role: userData.role,
        department: userData.department || null,
        position: userData.position || null,
        hireDate: userData.hire_date ? userData.hire_date.toISOString().split('T')[0] : null,
        managerId: userData.manager_id || null,
        hourlyRate: userData.hourly_rate?.toString() ?? null,
        bankName: userData.bank_name ? (encryptPII(userData.bank_name) || userData.bank_name) : null,
        accountHolderName: userData.account_holder_name ? (encryptPII(userData.account_holder_name) || userData.account_holder_name) : null,
        accountNumber: userData.account_number ? (encryptPII(userData.account_number) || userData.account_number) : null,
        bankBranch: userData.bank_branch ? (encryptPII(userData.bank_branch) || userData.bank_branch) : null,
        bankBranchCode: userData.bank_branch_code ? (encryptPII(userData.bank_branch_code) || userData.bank_branch_code) : null,
        swiftCode: userData.swift_code ? (encryptPII(userData.swift_code) || userData.swift_code) : null,
        companyName: userData.company_name ?? null,
        contactNumber: userData.contact_number ? (encryptPII(userData.contact_number) || userData.contact_number) : null,
        mustChangePassword: true,
        emailVerified: false,
        emailVerificationToken: userData.email_verification_token || null,
      })
      .returning();

    if (!insertedUser) {
      throw new Error('Failed to create user');
    }
    return decryptUserPII(insertedUser)!;
  }

  static async update(id: number, updates: Partial<DrizzleUser>): Promise<Omit<DrizzleUser, 'password'> | null> {
    // Filter out undefined values and restricted fields, and encrypt PII strings
    const filteredUpdates: any = {};
    const encryptKeys = [
      'firstName', 'lastName', 'email', 'contactNumber',
      'bankName', 'accountHolderName', 'accountNumber',
      'bankBranch', 'bankBranchCode', 'swiftCode'
    ];

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id' && key !== 'createdAt') {
        if (encryptKeys.includes(key) && typeof value === 'string' && value) {
          filteredUpdates[key] = encryptPII(value) || value;
        } else {
          filteredUpdates[key] = value;
        }
      }
    });

    if (Object.keys(filteredUpdates).length === 0) {
      return await this.findById(id);
    }

    await db
      .update(users)
      .set(filteredUpdates)
      .where(eq(users.id, id));

    return await this.findById(id);
  }

  static async updatePassword(id: number, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db
      .update(users)
      .set({
        password: hashedPassword,
        mustChangePassword: false,
      })
      .where(eq(users.id, id));
  }

  static async getAll(filters?: {
    role?: UserRole | UserRole[];
    department?: string;
    search?: string;
  }): Promise<Omit<DrizzleUser, 'password'>[]> {
    const conditions = [];

    if (filters?.role) {
      conditions.push(
        Array.isArray(filters.role)
          ? inArray(users.role, filters.role)
          : eq(users.role, filters.role)
      );
    }

    if (filters?.department) {
      conditions.push(eq(users.department, filters.department));
    }

    const allUsers = await db.query.users.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      columns: {
        password: false, // Exclude password
      },
      orderBy: (users, { desc }) => [desc(users.createdAt)],
    });

    const decryptedUsers = allUsers.map((u) => decryptUserPII(u)!);

    if (filters?.search) {
      const searchTerm = filters.search.toLowerCase();
      return decryptedUsers.filter((u) =>
        u.firstName?.toLowerCase().includes(searchTerm) ||
        u.lastName?.toLowerCase().includes(searchTerm) ||
        u.email?.toLowerCase().includes(searchTerm) ||
        u.employeeId?.toLowerCase().includes(searchTerm)
      );
    }

    return decryptedUsers;
  }

  static async delete(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  static async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  static async generateEmployeeId(): Promise<string> {
    const year = new Date().getFullYear();
    const pattern = `EMP${year}%`;

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(like(users.employeeId, pattern));

    const count = result[0]?.count || 0;
    const sequence = String(Number(count) + 1).padStart(4, '0');
    return `EMP${year}${sequence}`;
  }
}

// Alias matching the "tbl_employee" naming this model's underlying table was
// renamed to (drizzle/0009_tbl_prefix_and_employee_type.sql) - several test
// files already import this name.
export { UserModel as EmployeeModel };
