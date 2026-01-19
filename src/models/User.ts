import pool from '../config/database';
import { User, UserRole } from '../types';
import bcrypt from 'bcryptjs';

export class UserModel {
  static async findByEmail(email: string): Promise<User | null> {
    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    const users = rows as User[];
    return users[0] || null;
  }

  static async findById(id: number): Promise<User | null> {
    const [rows] = await pool.execute(
      'SELECT id, employee_id, email, first_name, last_name, role, department, position, hire_date, manager_id, must_change_password, created_at, updated_at FROM users WHERE id = ?',
      [id]
    );
    const users = rows as User[];
    return users[0] || null;
  }

  static async findByEmployeeId(employeeId: string): Promise<User | null> {
    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE employee_id = ?',
      [employeeId]
    );
    const users = rows as User[];
    return users[0] || null;
  }

  static async findByVerificationToken(token: string): Promise<User | null> {
    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE email_verification_token = ?',
      [token]
    );
    const users = rows as User[];
    return users[0] || null;
  }

  static async verifyEmail(userId: number): Promise<void> {
    await pool.execute(
      'UPDATE users SET email_verified = true, email_verification_token = NULL WHERE id = ?',
      [userId]
    );
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
    email_verification_token?: string;
  }): Promise<User> {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    const [result] = await pool.execute(
      `INSERT INTO users (employee_id, email, password, first_name, last_name, role, department, position, hire_date, manager_id, must_change_password, email_verified, email_verification_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true, false, ?)`,
      [
        userData.employee_id,
        userData.email,
        hashedPassword,
        userData.first_name,
        userData.last_name,
        userData.role,
        userData.department || null,
        userData.position || null,
        userData.hire_date || null,
        userData.manager_id || null,
        userData.email_verification_token || null
      ]
    );

    const insertResult = result as any;
    const user = await this.findById(insertResult.insertId);
    if (!user) {
      throw new Error('Failed to create user');
    }
    return user;
  }

  static async update(id: number, updates: Partial<User>): Promise<User | null> {
    const fields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id' && key !== 'created_at') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    if (fields.length === 0) return await this.findById(id);

    values.push(id);
    await pool.execute(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return await this.findById(id);
  }

  static async updatePassword(id: number, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.execute(
      'UPDATE users SET password = ?, must_change_password = false WHERE id = ?',
      [hashedPassword, id]
    );
  }

  static async getAll(filters?: {
    role?: UserRole;
    department?: string;
    search?: string;
  }): Promise<User[]> {
    let query = 'SELECT id, employee_id, email, first_name, last_name, role, department, position, hire_date, manager_id, must_change_password, email_verified, created_at, updated_at FROM users WHERE 1=1';
    const params: any[] = [];

    if (filters?.role) {
      query += ' AND role = ?';
      params.push(filters.role);
    }

    if (filters?.department) {
      query += ' AND department = ?';
      params.push(filters.department);
    }

    if (filters?.search) {
      query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR employee_id LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.execute(query, params);
    return rows as User[];
  }

  static async delete(id: number): Promise<void> {
    await pool.execute('DELETE FROM users WHERE id = ?', [id]);
  }

  static async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  static async generateEmployeeId(): Promise<string> {
    const year = new Date().getFullYear();
    const [rows] = await pool.execute(
      'SELECT COUNT(*) as count FROM users WHERE employee_id LIKE ?',
      [`EMP${year}%`]
    );
    const result = rows as any[];
    const count = result[0].count;
    const sequence = String(count + 1).padStart(4, '0');
    return `EMP${year}${sequence}`;
  }
}
