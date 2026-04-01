import { Request, Response } from 'express';
import { LeaveCalendarModel } from '../models/LeaveCalendar';

/**
 * Get all leave calendar entries
 */
export const getAllCalendarEntries = async (req: Request, res: Response) => {
  try {
    const { year } = req.query;
    
    let entries;
    if (year) {
      const yearStr = Array.isArray(year) ? year[0] : year;
      entries = await LeaveCalendarModel.getByYear(parseInt(yearStr as string));
    } else {
      entries = await LeaveCalendarModel.getAll();
    }

    res.json({ success: true, data: entries });
  } catch (error: any) {
    console.error('Get calendar entries error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch calendar entries', error: error.message });
  }
};

/**
 * Get calendar entries for a specific year
 */
export const getCalendarByYear = async (req: Request, res: Response) => {
  try {
    const { year } = req.params;
    const yearStr = Array.isArray(year) ? year[0] : year;
    const entries = await LeaveCalendarModel.getByYear(parseInt(yearStr));

    res.json({ success: true, data: entries });
  } catch (error: any) {
    console.error('Get calendar by year error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch calendar entries', error: error.message });
  }
};

/**
 * Get calendar entries within a date range
 */
export const getCalendarByDateRange = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Start date and end date are required' });
    }

    const entries = await LeaveCalendarModel.getByDateRange(
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json({ success: true, data: entries });
  } catch (error: any) {
    console.error('Get calendar by date range error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch calendar entries', error: error.message });
  }
};

/**
 * Create a new calendar entry
 */
export const createCalendarEntry = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { date, name, description, is_recurring, year } = req.body;

    if (!date || !name) {
      return res.status(400).json({ success: false, message: 'Date and name are required' });
    }

    // Check if date already exists
    const existing = await LeaveCalendarModel.getByDateRange(new Date(date), new Date(date));
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'A holiday already exists for this date' });
    }

    const entry = await LeaveCalendarModel.create({
      date: new Date(date),
      name,
      description,
      is_recurring: is_recurring === true || is_recurring === 'true',
      year: year ? parseInt(year) : undefined,
      created_by: userId
    });

    res.status(201).json({ success: true, message: 'Calendar entry created successfully', data: entry });
  } catch (error: any) {
    console.error('Create calendar entry error:', error);
    res.status(500).json({ success: false, message: 'Failed to create calendar entry', error: error.message });
  }
};

/**
 * Update a calendar entry
 */
export const updateCalendarEntry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idStr = Array.isArray(id) ? id[0] : id;
    const { date, name, description, is_recurring, year } = req.body;

    const entry = await LeaveCalendarModel.update(parseInt(idStr), {
      date: date ? new Date(date) : undefined,
      name,
      description,
      is_recurring: is_recurring !== undefined ? (is_recurring === true || is_recurring === 'true') : undefined,
      year: year ? parseInt(String(year)) : undefined
    });

    res.json({ success: true, message: 'Calendar entry updated successfully', data: entry });
  } catch (error: any) {
    console.error('Update calendar entry error:', error);
    res.status(500).json({ success: false, message: 'Failed to update calendar entry', error: error.message });
  }
};

/**
 * Delete a calendar entry
 */
export const deleteCalendarEntry = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idStr = Array.isArray(id) ? id[0] : id;
    const deleted = await LeaveCalendarModel.delete(parseInt(idStr));

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Calendar entry not found' });
    }

    res.json({ success: true, message: 'Calendar entry deleted successfully' });
  } catch (error: any) {
    console.error('Delete calendar entry error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete calendar entry', error: error.message });
  }
};

/**
 * Get holiday count between two dates
 */
export const getHolidayCount = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Start date and end date are required' });
    }

    const count = await LeaveCalendarModel.getHolidayCount(
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json({ success: true, count });
  } catch (error: any) {
    console.error('Get holiday count error:', error);
    res.status(500).json({ success: false, message: 'Failed to get holiday count', error: error.message });
  }
};

/**
 * Check if a date is a holiday
 */
export const checkIsHoliday = async (req: Request, res: Response) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required' });
    }

    const isHoliday = await LeaveCalendarModel.isHoliday(new Date(date as string));

    res.json({ success: true, isHoliday });
  } catch (error: any) {
    console.error('Check is holiday error:', error);
    res.status(500).json({ success: false, message: 'Failed to check holiday', error: error.message });
  }
};
