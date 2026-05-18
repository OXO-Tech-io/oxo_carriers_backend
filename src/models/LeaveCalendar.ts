import pool from '../config/database';
import { LeaveCalendar } from '../types';

export class LeaveCalendarModel {
  /**
   * Create a new holiday/calendar entry
   */
  static async create(calendar: {
    date: Date;
    name: string;
    description?: string;
    is_recurring?: boolean;
    year?: number;
    created_by?: number;
  }): Promise<LeaveCalendar> {
    const result = await pool.query(
      `INSERT INTO leave_calendar (date, name, description, is_recurring, year, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        calendar.date,
        calendar.name,
        calendar.description || null,
        calendar.is_recurring || false,
        calendar.year || null,
        calendar.created_by || null
      ]
    );

    const newId = (result.rows[0] as any).id;
    const created = await this.findById(newId);
    if (!created) {
      throw new Error('Failed to create leave calendar entry');
    }
    return created;
  }

  /**
   * Find calendar entry by ID
   */
  static async findById(id: number): Promise<LeaveCalendar | null> {
    const result = await pool.query(
      `SELECT * FROM leave_calendar WHERE id = $1`,
      [id]
    );

    const calendar = (result.rows as any[])[0];
    if (!calendar) return null;

    return {
      id: calendar.id,
      date: new Date(calendar.date),
      name: calendar.name,
      description: calendar.description || undefined,
      is_recurring: Boolean(calendar.is_recurring),
      year: calendar.year || undefined,
      created_by: calendar.created_by || undefined,
      created_at: new Date(calendar.created_at),
      updated_at: new Date(calendar.updated_at)
    };
  }

  /**
   * Get all calendar entries for a specific year
   */
  static async getByYear(year: number): Promise<LeaveCalendar[]> {
    const result = await pool.query(
      `SELECT * FROM leave_calendar
       WHERE year = $1 OR (is_recurring = true AND (year IS NULL OR year = $2))
       ORDER BY date ASC`,
      [year, year]
    );

    return (result.rows as any[]).map(row => ({
      id: row.id,
      date: new Date(row.date),
      name: row.name,
      description: row.description || undefined,
      is_recurring: Boolean(row.is_recurring),
      year: row.year || undefined,
      created_by: row.created_by || undefined,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    }));
  }

  /**
   * Get all calendar entries within a date range
   */
  static async getByDateRange(startDate: Date, endDate: Date): Promise<LeaveCalendar[]> {
    const result = await pool.query(
      `SELECT * FROM leave_calendar
       WHERE date BETWEEN $1 AND $2
       ORDER BY date ASC`,
      [startDate, endDate]
    );

    return (result.rows as any[]).map(row => ({
      id: row.id,
      date: new Date(row.date),
      name: row.name,
      description: row.description || undefined,
      is_recurring: Boolean(row.is_recurring),
      year: row.year || undefined,
      created_by: row.created_by || undefined,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    }));
  }

  /**
   * Get all calendar entries
   */
  static async getAll(): Promise<LeaveCalendar[]> {
    const result = await pool.query(
      `SELECT * FROM leave_calendar ORDER BY date ASC`
    );

    return (result.rows as any[]).map(row => ({
      id: row.id,
      date: new Date(row.date),
      name: row.name,
      description: row.description || undefined,
      is_recurring: Boolean(row.is_recurring),
      year: row.year || undefined,
      created_by: row.created_by || undefined,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    }));
  }

  /**
   * Check if a date is a holiday
   */
  static async isHoliday(date: Date): Promise<boolean> {
    const dateStr = date.toISOString().split('T')[0];
    const year = date.getFullYear();

    const result = await pool.query(
      `SELECT COUNT(*) as count FROM leave_calendar
       WHERE date::date = $1
       AND (year = $2 OR (is_recurring = true AND (year IS NULL OR year = $3)))`,
      [dateStr, year, year]
    );

    const row = (result.rows as any[])[0];
    return Number(row.count) > 0;
  }

  /**
   * Get count of holidays between two dates (excluding weekends).
   * Note: EXTRACT(DOW) returns 0 (Sun) .. 6 (Sat) in Postgres.
   */
  static async getHolidayCount(startDate: Date, endDate: Date): Promise<number> {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM leave_calendar
       WHERE date BETWEEN $1 AND $2
       AND EXTRACT(DOW FROM date) NOT IN (0, 6)`,
      [startDate, endDate]
    );

    const row = (result.rows as any[])[0];
    return Number(row.count) || 0;
  }

  /**
   * Get all holidays between two dates
   */
  static async getHolidaysInRange(startDate: Date, endDate: Date): Promise<LeaveCalendar[]> {
    const result = await pool.query(
      `SELECT * FROM leave_calendar
       WHERE date BETWEEN $1 AND $2
       ORDER BY date ASC`,
      [startDate, endDate]
    );

    return (result.rows as any[]).map(row => ({
      id: row.id,
      date: new Date(row.date),
      name: row.name,
      description: row.description || undefined,
      is_recurring: Boolean(row.is_recurring),
      year: row.year || undefined,
      created_by: row.created_by || undefined,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at)
    }));
  }

  /**
   * Update calendar entry
   */
  static async update(id: number, updates: {
    date?: Date;
    name?: string;
    description?: string;
    is_recurring?: boolean;
    year?: number;
  }): Promise<LeaveCalendar> {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.date !== undefined) {
      values.push(updates.date);
      fields.push(`date = $${values.length}`);
    }
    if (updates.name !== undefined) {
      values.push(updates.name);
      fields.push(`name = $${values.length}`);
    }
    if (updates.description !== undefined) {
      values.push(updates.description);
      fields.push(`description = $${values.length}`);
    }
    if (updates.is_recurring !== undefined) {
      values.push(updates.is_recurring);
      fields.push(`is_recurring = $${values.length}`);
    }
    if (updates.year !== undefined) {
      values.push(updates.year);
      fields.push(`year = $${values.length}`);
    }

    if (fields.length === 0) {
      const existing = await this.findById(id);
      if (!existing) throw new Error('Calendar entry not found');
      return existing;
    }

    values.push(id);
    await pool.query(
      `UPDATE leave_calendar SET ${fields.join(', ')} WHERE id = $${values.length}`,
      values
    );

    const updated = await this.findById(id);
    if (!updated) {
      throw new Error('Failed to update leave calendar entry');
    }
    return updated;
  }

  /**
   * Delete calendar entry
   */
  static async delete(id: number): Promise<boolean> {
    const result = await pool.query(
      `DELETE FROM leave_calendar WHERE id = $1`,
      [id]
    );

    return (result.rowCount ?? 0) > 0;
  }
}
