import pool from '../config/database';
import { Facility, FacilityType } from '../types';
import { FacilityBookingModel } from './FacilityBooking';

export class FacilityModel {
  static async getAll(filters?: { type?: FacilityType; is_active?: boolean }): Promise<Facility[]> {
    let query = 'SELECT * FROM facilities WHERE 1=1';
    const params: any[] = [];

    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters?.is_active !== undefined) {
      query += ' AND is_active = ?';
      params.push(filters.is_active);
    }

    const [rows] = await pool.execute(query, params);
    return rows as Facility[];
  }

  static async findById(id: number): Promise<Facility | null> {
    const [rows] = await pool.execute('SELECT * FROM facilities WHERE id = ?', [id]);
    const facilities = rows as Facility[];
    return facilities[0] || null;
  }

  static async create(facilityData: Partial<Facility>): Promise<Facility> {
    const [result] = await pool.execute(
      'INSERT INTO facilities (name, type, description, facilities, capacity, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [
        facilityData.name,
        facilityData.type,
        facilityData.description || null,
        facilityData.facilities || null,
        facilityData.capacity || 1,
        facilityData.is_active !== undefined ? facilityData.is_active : true
      ]
    );

    const insertResult = result as any;
    const facility = await this.findById(insertResult.insertId);
    if (!facility) {
      throw new Error('Failed to create facility');
    }
    return facility;
  }

  static async update(id: number, updates: Partial<Facility>): Promise<Facility | null> {
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
    await pool.execute(`UPDATE facilities SET ${fields.join(', ')} WHERE id = ?`, values);

    return await this.findById(id);
  }

  static async delete(id: number): Promise<void> {
    await pool.execute('DELETE FROM facilities WHERE id = ?', [id]);
  }

  /** Get facilities of a given type that are available for the time range (no overlapping confirmed bookings). */
  static async getAvailableByTypeAndTime(
    type: FacilityType,
    startTime: Date,
    endTime: Date
  ): Promise<Facility[]> {
    const allOfType = await this.getAll({ type, is_active: true });
    const available: Facility[] = [];
    for (const f of allOfType) {
      const isAvailable = await FacilityBookingModel.checkAvailability(
        f.id,
        startTime,
        endTime
      );
      if (isAvailable) available.push(f);
    }
    return available;
  }
}
