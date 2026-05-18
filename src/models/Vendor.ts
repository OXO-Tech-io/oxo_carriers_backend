import pool from '../config/database';
import { Vendor } from '../types';
import { VENDOR_QUERIES } from '../constants/dbQueries';
import { VENDOR_ERRORS } from '../constants/errorMessages';

export class VendorModel {
  static async findByEmail(email: string): Promise<Vendor | null> {
    const result = await pool.query(VENDOR_QUERIES.FIND_BY_EMAIL, [email]);
    const list = result.rows as Vendor[];
    return list[0] || null;
  }

  static async findById(id: number): Promise<Vendor | null> {
    const result = await pool.query(VENDOR_QUERIES.FIND_BY_ID, [id]);
    const list = result.rows as Vendor[];
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
    const result = await pool.query(
      `INSERT INTO vendors (email, company_name, contact_number, bank_name, account_holder_name, account_number, bank_branch)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
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
    const newId = (result.rows[0] as any).id;
    const vendor = await this.findById(newId);
    if (!vendor) throw new Error(VENDOR_ERRORS.FAILED_TO_CREATE);
    return vendor;
  }

  static async getAll(filters?: { search?: string }): Promise<Vendor[]> {
    let query = 'SELECT * FROM vendors WHERE 1=1';
    const params: any[] = [];
    if (filters?.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term);
      query += ` AND (company_name LIKE $${params.length - 2} OR email LIKE $${params.length - 1} OR contact_number LIKE $${params.length})`;
    }
    query += ' ORDER BY company_name ASC';
    const result = await pool.query(query, params);
    return result.rows as Vendor[];
  }
}
