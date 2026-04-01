import pool from '../config/database';
import { FacilityBooking, BookingStatus } from '../types';

export class FacilityBookingModel {
  static async getAll(filters?: { 
    user_id?: number; 
    facility_id?: number; 
    status?: BookingStatus;
    start_date?: string;
    end_date?: string;
  }): Promise<any[]> {
    let query = `
      SELECT fb.*, f.name as facility_name, f.type as facility_type, 
             u.first_name, u.last_name
      FROM facility_bookings fb
      JOIN facilities f ON fb.facility_id = f.id
      JOIN users u ON fb.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.user_id) {
      query += ' AND fb.user_id = ?';
      params.push(filters.user_id);
    }

    if (filters?.facility_id) {
      query += ' AND fb.facility_id = ?';
      params.push(filters.facility_id);
    }

    if (filters?.status) {
      query += ' AND fb.status = ?';
      params.push(filters.status);
    }

    if (filters?.start_date) {
      query += ' AND fb.start_time >= ?';
      params.push(filters.start_date);
    }

    if (filters?.end_date) {
      query += ' AND fb.end_time <= ?';
      params.push(filters.end_date);
    }

    query += ' ORDER BY fb.start_time DESC';

    const [rows] = await pool.execute(query, params);
    return rows as any[];
  }

  static async findById(id: number): Promise<any | null> {
    const [rows] = await pool.execute(`
      SELECT fb.*, f.name as facility_name, f.type as facility_type,
             u.first_name, u.last_name
      FROM facility_bookings fb
      JOIN facilities f ON fb.facility_id = f.id
      JOIN users u ON fb.user_id = u.id
      WHERE fb.id = ?
    `, [id]);
    const bookings = rows as any[];
    return bookings[0] || null;
  }

  static async checkAvailability(facility_id: number, start_time: Date, end_time: Date, excludeBookingId?: number): Promise<boolean> {
    let query = `
      SELECT COUNT(*) as count 
      FROM facility_bookings 
      WHERE facility_id = ? 
      AND status NOT IN ('cancelled')
      AND (start_time < ? AND end_time > ?)
    `;
    const params: any[] = [facility_id, end_time, start_time];

    if (excludeBookingId) {
      query += ' AND id != ?';
      params.push(excludeBookingId);
    }

    const [rows]: any = await pool.execute(query, params);
    return rows[0].count === 0;
  }

  static async create(bookingData: Partial<FacilityBooking>): Promise<FacilityBooking> {
    const [result] = await pool.execute(
      'INSERT INTO facility_bookings (facility_id, user_id, start_time, end_time, purpose, status) VALUES (?, ?, ?, ?, ?, ?)',
      [
        bookingData.facility_id,
        bookingData.user_id,
        bookingData.start_time,
        bookingData.end_time,
        bookingData.purpose || null,
        bookingData.status || BookingStatus.CONFIRMED
      ]
    );

    const insertResult = result as any;
    const booking = await this.findById(insertResult.insertId);
    if (!booking) {
      throw new Error('Failed to create booking');
    }
    return booking;
  }

  static async updateStatus(id: number, status: BookingStatus): Promise<void> {
    await pool.execute('UPDATE facility_bookings SET status = ? WHERE id = ?', [status, id]);
  }

  static async delete(id: number): Promise<void> {
    await pool.execute('DELETE FROM facility_bookings WHERE id = ?', [id]);
  }
}
