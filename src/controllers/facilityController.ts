import { Request, Response } from 'express';
import { FacilityModel } from '../models/Facility';
import { FacilityBookingModel } from '../models/FacilityBooking';
import { AuthRequest, BookingStatus, FacilityType, UserRole } from '../types';

export class FacilityController {
  // Facility Management (Admin)
  static async getAllFacilities(req: Request, res: Response) {
    try {
      const type = req.query.type as FacilityType;
      const facilities = await FacilityModel.getAll({ type });
      res.json(facilities);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  /** GET /facilities/available?type=workstation&start_time=ISO&end_time=ISO - list facilities of type available for time range */
  static async getAvailable(req: Request, res: Response) {
    try {
      const type = req.query.type as FacilityType;
      const start_time = req.query.start_time as string;
      const end_time = req.query.end_time as string;
      if (!type || !start_time || !end_time) {
        return res.status(400).json({
          message: 'Query params type, start_time and end_time are required',
        });
      }
      const start = new Date(start_time);
      const end = new Date(end_time);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        return res.status(400).json({
          message: 'Invalid start_time or end_time',
        });
      }
      const facilities = await FacilityModel.getAvailableByTypeAndTime(type, start, end);
      res.json(facilities);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  static async createFacility(req: Request, res: Response) {
    try {
      const facility = await FacilityModel.create(req.body);
      res.status(201).json(facility);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  static async updateFacility(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id as string);
      const facility = await FacilityModel.update(id, req.body);
      if (!facility) return res.status(404).json({ message: 'Facility not found' });
      res.json(facility);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  static async deleteFacility(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id as string);
      await FacilityModel.delete(id);
      res.json({ message: 'Facility deleted successfully' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  // Booking Management
  static async createBooking(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const { facility_id, start_time, end_time, purpose } = req.body;
      const user_id = authReq.user?.userId;

      if (!user_id) return res.status(401).json({ message: 'Unauthorized' });

      // Check availability
      const isAvailable = await FacilityBookingModel.checkAvailability(
        facility_id,
        new Date(start_time),
        new Date(end_time)
      );

      if (!isAvailable) {
        return res.status(400).json({ message: 'Facility is not available for the selected time slot' });
      }

      const booking = await FacilityBookingModel.create({
        facility_id,
        user_id,
        start_time: new Date(start_time),
        end_time: new Date(end_time),
        purpose,
        status: BookingStatus.CONFIRMED
      });

      res.status(201).json(booking);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  static async getMyBookings(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const user_id = authReq.user?.userId;
      if (!user_id) return res.status(401).json({ message: 'Unauthorized' });

      const bookings = await FacilityBookingModel.getAll({ user_id });
      res.json(bookings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  static async getAllBookings(req: Request, res: Response) {
    try {
      const bookings = await FacilityBookingModel.getAll(req.query as any);
      res.json(bookings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  static async cancelBooking(req: Request, res: Response) {
    try {
      const authReq = req as AuthRequest;
      const id = parseInt(req.params.id as string);
      const user_id = authReq.user?.userId;
      const role = authReq.user?.role;

      const booking = await FacilityBookingModel.findById(id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });

      // Only allow owner or admin/hr to cancel
      if (booking.user_id !== user_id && role === UserRole.EMPLOYEE) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      await FacilityBookingModel.updateStatus(id, BookingStatus.CANCELLED);
      res.json({ message: 'Booking cancelled' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
}
