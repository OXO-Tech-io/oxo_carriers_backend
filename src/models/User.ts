import { db } from '../db';
import { users, userPermissions, type User as DrizzleUser } from '../db/schema';
import { User, UserRole } from '../types';
import { eq, like, or, and, sql } from 'drizzle-orm';
import { encryptPII, decryptPII } from '../utils/encryption';

function decryptUser(user: DrizzleUser | null): DrizzleUser | null {
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
  static async findByEmail(email: string): Promise<DrizzleUser | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    return decryptUser(user || null);
  }

  static async findById(id: number): Promise<DrizzleUser | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
    });
    return decryptUser(user || null);
  }

  static async findByKeycloakSub(sub: string): Promise<DrizzleUser | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.keycloakSub, sub),
    });
    return decryptUser(user || null);
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
      ];
      for (const permission of defaultPermissions) {
        await db.insert(userPermissions).values({
          userId: insertedUser.id,
          permissionKey: permission,
          accessLevel: 'read',
        });
      }
    }

    return decryptUser(insertedUser) as DrizzleUser;
  }

  static async findByEmployeeId(employeeId: string): Promise<DrizzleUser | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.employeeId, employeeId),
    });
    return decryptUser(user || null);
  }

  static async findByVerificationToken(token: string): Promise<DrizzleUser | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.emailVerificationToken, token),
    });
    return decryptUser(user || null);
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
    company_name?: string | null;
    contact_number?: string | null;
    email_verification_token?: string;
  }): Promise<DrizzleUser> {
    const [insertedUser] = await db
      .insert(users)
      .values({
        employeeId: userData.employee_id,
        email: userData.email,
        firstName: userData.first_name,
        lastName: userData.last_name,
        role: userData.role,
        department: userData.department || null,
        position: userData.position || null,
        hireDate: userData.hire_date ? userData.hire_date.toISOString().split('T')[0] : null,
        managerId: userData.manager_id || null,
        hourlyRate: encryptPII(userData.hourly_rate?.toString()) ?? null,
        bankName: encryptPII(userData.bank_name) ?? null,
        accountHolderName: encryptPII(userData.account_holder_name) ?? null,
        accountNumber: encryptPII(userData.account_number) ?? null,
        bankBranch: encryptPII(userData.bank_branch) ?? null,
        companyName: encryptPII(userData.company_name) ?? null,
        contactNumber: encryptPII(userData.contact_number) ?? null,
        emailVerified: false,
        emailVerificationToken: userData.email_verification_token || null,
      })
      .returning();

    if (!insertedUser) {
      throw new Error('Failed to create user');
    }
    return decryptUser(insertedUser) as DrizzleUser;
  }

  static async update(id: number, updates: Partial<DrizzleUser>): Promise<DrizzleUser | null> {
    // Filter out undefined values and restricted fields
    const filteredUpdates: any = {};
    const piiFields = [
      'hourlyRate',
      'bankName',
      'accountHolderName',
      'accountNumber',
      'bankBranch',
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
      .update(users)
      .set(filteredUpdates)
      .where(eq(users.id, id));

    return await this.findById(id);
  }

  static async getAll(filters?: {
    role?: UserRole;
    department?: string;
    search?: string;
  }): Promise<DrizzleUser[]> {
    const conditions = [];

    if (filters?.role) {
      conditions.push(eq(users.role, filters.role));
    }

    if (filters?.department) {
      conditions.push(eq(users.department, filters.department));
    }

    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          like(users.firstName, searchTerm),
          like(users.lastName, searchTerm),
          like(users.email, searchTerm),
          like(users.employeeId, searchTerm)
        )
      );
    }

    const allUsers = await db.query.users.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: (users, { desc }) => [desc(users.createdAt)],
    });

    return allUsers.map(user => decryptUser(user)) as DrizzleUser[];
  }

  static async delete(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
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
