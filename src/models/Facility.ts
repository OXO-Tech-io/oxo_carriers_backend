import pool from '../config/database';
import { Facility, FacilityType } from '../types';
import { FacilityBookingModel } from './FacilityBooking';

export class FacilityModel {
  static async getAll(filters?: { type?: FacilityType; is_active?: boolean }): Promise<Facility[]> {
    let query = 'SELECT * FROM facilities WHERE 1=1';
    const params: any[] = [];

    if (filters?.type) {
      params.push(filters.type);
      query += ` AND type = $${params.length}`;
    }

    if (filters?.is_active !== undefined) {
      params.push(filters.is_active);
      query += ` AND is_active = $${params.length}`;
    }

    const result = await pool.query(query, params);
    return result.rows as Facility[];
  }

  static async findById(id: number): Promise<Facility | null> {
    const result = await pool.query('SELECT * FROM facilities WHERE id = $1', [id]);
    const facilities = result.rows as Facility[];
    return facilities[0] || null;
  }

  static async create(facilityData: Partial<Facility>): Promise<Facility> {
    const params: any[] = [
      facilityData.name,
      facilityData.type,
      facilityData.description || null,
      facilityData.facilities || null,
      facilityData.capacity || 1,
      facilityData.is_active !== undefined ? facilityData.is_active : true
    ];
    const result = await pool.query(
      'INSERT INTO facilities (name, type, description, facilities, capacity, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      params
    );

    const newId = (result.rows[0] as any).id;
    const facility = await this.findById(newId);
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
        values.push(value);
        fields.push(`${key} = $${values.length}`);
      }
    });

    if (fields.length === 0) return await this.findById(id);

    values.push(id);
    await pool.query(`UPDATE facilities SET ${fields.join(', ')} WHERE id = $${values.length}`, values);

    return await this.findById(id);
  }

  static async delete(id: number): Promise<void> {
    await pool.query('DELETE FROM facilities WHERE id = $1', [id]);
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
