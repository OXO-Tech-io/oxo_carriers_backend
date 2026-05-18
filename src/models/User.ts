import { db } from '../db';
import { users, type User as DrizzleUser } from '../db/schema';
import { User, UserRole } from '../types';
import bcrypt from 'bcryptjs';
import { eq, like, or, and, sql } from 'drizzle-orm';

export class UserModel {
  static async findByEmail(email: string): Promise<DrizzleUser | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    return user || null;
  }

  static async findById(id: number): Promise<Omit<DrizzleUser, 'password'> | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
      columns: {
        password: false, // Exclude password from result
      },
    });
    return user || null;
  }

  static async findByKeycloakSub(sub: string): Promise<DrizzleUser | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.keycloakSub, sub),
    });
    return user || null;
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
        mustChangePassword: false,
        emailVerified: true,
      })
      .returning();

    if (!insertedUser) throw new Error('Failed to create user from Keycloak claims');
    return insertedUser;
  }

  static async findByEmployeeId(employeeId: string): Promise<DrizzleUser | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.employeeId, employeeId),
    });
    return user || null;
  }

  static async findByVerificationToken(token: string): Promise<DrizzleUser | null> {
    const user = await db.query.users.findFirst({
      where: eq(users.emailVerificationToken, token),
    });
    return user || null;
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
    company_name?: string | null;
    contact_number?: string | null;
    email_verification_token?: string;
  }): Promise<DrizzleUser> {
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    const [insertedUser] = await db
      .insert(users)
      .values({
        employeeId: userData.employee_id,
        email: userData.email,
        password: hashedPassword,
        firstName: userData.first_name,
        lastName: userData.last_name,
        role: userData.role,
        department: userData.department || null,
        position: userData.position || null,
        hireDate: userData.hire_date ? userData.hire_date.toISOString().split('T')[0] : null,
        managerId: userData.manager_id || null,
        hourlyRate: userData.hourly_rate?.toString() ?? null,
        bankName: userData.bank_name ?? null,
        accountHolderName: userData.account_holder_name ?? null,
        accountNumber: userData.account_number ?? null,
        bankBranch: userData.bank_branch ?? null,
        companyName: userData.company_name ?? null,
        contactNumber: userData.contact_number ?? null,
        mustChangePassword: true,
        emailVerified: false,
        emailVerificationToken: userData.email_verification_token || null,
      })
      .returning();

    if (!insertedUser) {
      throw new Error('Failed to create user');
    }
    return insertedUser;
  }

  static async update(id: number, updates: Partial<DrizzleUser>): Promise<Omit<DrizzleUser, 'password'> | null> {
    // Filter out undefined values and restricted fields
    const filteredUpdates: any = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id' && key !== 'createdAt') {
        filteredUpdates[key] = value;
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
    role?: UserRole;
    department?: string;
    search?: string;
  }): Promise<Omit<DrizzleUser, 'password'>[]> {
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
      columns: {
        password: false, // Exclude password
      },
      orderBy: (users, { desc }) => [desc(users.createdAt)],
    });

    return allUsers;
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
