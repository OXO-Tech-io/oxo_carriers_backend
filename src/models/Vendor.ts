import pool from '../config/database';
import { Vendor } from '../types';

export class VendorModel {
  static async findByEmail(email: string): Promise<Vendor | null> {
    const [rows] = await pool.execute('SELECT * FROM vendors WHERE email = ?', [email]);
    const list = rows as Vendor[];
    return list[0] || null;
  }

  static async findById(id: number): Promise<Vendor | null> {
    const [rows] = await pool.execute('SELECT * FROM vendors WHERE id = ?', [id]);
    const list = rows as Vendor[];
    return list[0] || null;
  }

  static async create(data: {
    email: string;
    company_name: string;
    contact_number?: string | null;
    bank_name?: string | null;
    account_holder_name?: string | null;
    account_number?: string | null;
    bank_branch?: string | null;
  }): Promise<Vendor> {
    const [result] = await pool.execute(
      `INSERT INTO vendors (email, company_name, contact_number, bank_name, account_holder_name, account_number, bank_branch)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.email,
        data.company_name,
        data.contact_number ?? null,
        data.bank_name ?? null,
        data.account_holder_name ?? null,
        data.account_number ?? null,
        data.bank_branch ?? null,
      ]
    );
    const insertResult = result as any;
    const vendor = await this.findById(insertResult.insertId);
    if (!vendor) throw new Error('Failed to create vendor');
    return vendor;
  }

  static async getAll(filters?: { search?: string }): Promise<Vendor[]> {
    let query = 'SELECT * FROM vendors WHERE 1=1';
    const params: any[] = [];
    if (filters?.search?.trim()) {
      query += ' AND (company_name LIKE ? OR email LIKE ? OR contact_number LIKE ?)';
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term);
    }
    query += ' ORDER BY company_name ASC';
    const [rows] = await pool.execute(query, params);
    return rows as Vendor[];
  }
}
