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
    const [result] = await pool.execute(
      `INSERT INTO leave_calendar (date, name, description, is_recurring, year, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        calendar.date,
        calendar.name,
        calendar.description || null,
        calendar.is_recurring || false,
        calendar.year || null,
        calendar.created_by || null
      ]
    );

    const insertResult = result as any;
    const created = await this.findById(insertResult.insertId);
    if (!created) {
      throw new Error('Failed to create leave calendar entry');
    }
    return created;
  }

  /**
   * Find calendar entry by ID
   */
  static async findById(id: number): Promise<LeaveCalendar | null> {
    const [rows] = await pool.execute(
      `SELECT * FROM leave_calendar WHERE id = ?`,
      [id]
    );

    const calendar = (rows as any[])[0];
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
    const [rows] = await pool.execute(
      `SELECT * FROM leave_calendar 
       WHERE year = ? OR (is_recurring = true AND (year IS NULL OR year = ?))
       ORDER BY date ASC`,
      [year, year]
    );

    return (rows as any[]).map(row => ({
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
    const [rows] = await pool.execute(
      `SELECT * FROM leave_calendar 
       WHERE date BETWEEN ? AND ?
       ORDER BY date ASC`,
      [startDate, endDate]
    );

    return (rows as any[]).map(row => ({
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
    const [rows] = await pool.execute(
      `SELECT * FROM leave_calendar ORDER BY date ASC`
    );

    return (rows as any[]).map(row => ({
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
    
    const [rows] = await pool.execute(
      `SELECT COUNT(*) as count FROM leave_calendar 
       WHERE DATE(date) = ? 
       AND (year = ? OR (is_recurring = true AND (year IS NULL OR year = ?)))`,
      [dateStr, year, year]
    );

    const result = (rows as any[])[0];
    return result.count > 0;
  }

  /**
   * Get count of holidays between two dates (excluding weekends)
   */
  static async getHolidayCount(startDate: Date, endDate: Date): Promise<number> {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) as count FROM leave_calendar 
       WHERE date BETWEEN ? AND ?
       AND DAYOFWEEK(date) NOT IN (1, 7)`,
      [startDate, endDate]
    );

    const result = (rows as any[])[0];
    return result.count || 0;
  }

  /**
   * Get all holidays between two dates
   */
  static async getHolidaysInRange(startDate: Date, endDate: Date): Promise<LeaveCalendar[]> {
    const [rows] = await pool.execute(
      `SELECT * FROM leave_calendar 
       WHERE date BETWEEN ? AND ?
       ORDER BY date ASC`,
      [startDate, endDate]
    );

    return (rows as any[]).map(row => ({
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
      fields.push('date = ?');
      values.push(updates.date);
    }
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.is_recurring !== undefined) {
      fields.push('is_recurring = ?');
      values.push(updates.is_recurring);
    }
    if (updates.year !== undefined) {
      fields.push('year = ?');
      values.push(updates.year);
    }

    if (fields.length === 0) {
      const existing = await this.findById(id);
      if (!existing) throw new Error('Calendar entry not found');
      return existing;
    }

    values.push(id);
    await pool.execute(
      `UPDATE leave_calendar SET ${fields.join(', ')} WHERE id = ?`,
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
    const [result] = await pool.execute(
      `DELETE FROM leave_calendar WHERE id = ?`,
      [id]
    );

    const deleteResult = result as any;
    return deleteResult.affectedRows > 0;
  }
}
