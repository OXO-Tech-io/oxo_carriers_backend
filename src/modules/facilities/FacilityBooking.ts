import pool from "../../config/database";
import { FacilityBooking, BookingStatus } from "../../types";
import { EmployeeModel } from "../../employees/Employee";

async function withEmployeeNames(rows: any[]): Promise<any[]> {
  const employeeMap = await EmployeeModel.findByEmployeeIds(rows.map(r => r.employee_id));
  return rows.map(row => {
    const emp = employeeMap.get(row.employee_id);
    return { ...row, first_name: emp?.firstName, last_name: emp?.lastName };
  });
}

export class FacilityBookingModel {
  static async getAll(filters?: {
    employee_id?: string;
    facility_id?: number;
    status?: BookingStatus;
    start_date?: string;
    end_date?: string;
  }): Promise<any[]> {
    let query = `
      SELECT fb.*, f.name as facility_name, f.type as facility_type
      FROM tbl_facility_bookings fb
      JOIN tbl_facilities f ON fb.facility_id = f.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.employee_id) {
      params.push(filters.employee_id);
      query += ` AND fb.employee_id = $${params.length}`;
    }

    if (filters?.facility_id) {
      params.push(filters.facility_id);
      query += ` AND fb.facility_id = $${params.length}`;
    }

    if (filters?.status) {
      params.push(filters.status);
      query += ` AND fb.status = $${params.length}`;
    }

    if (filters?.start_date) {
      params.push(filters.start_date);
      query += ` AND fb.start_time >= $${params.length}`;
    }

    if (filters?.end_date) {
      params.push(filters.end_date);
      query += ` AND fb.end_time <= $${params.length}`;
    }

    query += " ORDER BY fb.start_time DESC";

    const result = await pool.query(query, params);
    return withEmployeeNames(result.rows as any[]);
  }

  static async findById(id: number): Promise<any | null> {
    const result = await pool.query(
      `
      SELECT fb.*, f.name as facility_name, f.type as facility_type
      FROM tbl_facility_bookings fb
      JOIN tbl_facilities f ON fb.facility_id = f.id
      WHERE fb.id = $1
    `,
      [id],
    );
    const bookings = result.rows as any[];
    if (bookings.length === 0) return null;
    return (await withEmployeeNames(bookings))[0];
  }

  static async checkAvailability(
    facility_id: number,
    start_time: Date,
    end_time: Date,
    excludeBookingId?: number,
  ): Promise<boolean> {
    let query = `
      SELECT COUNT(*) as count
      FROM tbl_facility_bookings
      WHERE facility_id = $1
      AND status NOT IN ('cancelled')
      AND (start_time < $2 AND end_time > $3)
    `;
    const params: any[] = [facility_id, end_time, start_time];

    if (excludeBookingId) {
      params.push(excludeBookingId);
      query += ` AND id != $${params.length}`;
    }

    const result = await pool.query(query, params);
    const rows = result.rows as any[];
    return Number(rows[0].count) === 0;
  }

  static async create(
    bookingData: Partial<FacilityBooking>,
  ): Promise<FacilityBooking> {
    if (
      bookingData.facility_id === undefined ||
      bookingData.employee_id === undefined ||
      bookingData.start_time === undefined ||
      bookingData.end_time === undefined
    ) {
      throw new Error("Missing required booking fields");
    }

    const params: [number, string, Date, Date, string | null, BookingStatus] = [
      bookingData.facility_id,
      bookingData.employee_id,
      bookingData.start_time,
      bookingData.end_time,
      bookingData.purpose || null,
      bookingData.status || BookingStatus.CONFIRMED,
    ];

    const result = await pool.query(
      "INSERT INTO tbl_facility_bookings (facility_id, employee_id, start_time, end_time, purpose, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      params,
    );

    const newId = (result.rows[0] as any).id;
    const booking = await this.findById(newId);
    if (!booking) {
      throw new Error("Failed to create booking");
    }
    return booking;
  }

  static async updateStatus(id: number, status: BookingStatus): Promise<void> {
    await pool.query("UPDATE tbl_facility_bookings SET status = $1 WHERE id = $2", [
      status,
      id,
    ]);
  }

  static async delete(id: number): Promise<void> {
    await pool.query("DELETE FROM tbl_facility_bookings WHERE id = $1", [id]);
  }
}
