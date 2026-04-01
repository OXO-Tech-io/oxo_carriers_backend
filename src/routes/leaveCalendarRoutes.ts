import { Router } from 'express';
import * as leaveCalendarController from '../controllers/leaveCalendarController';
import { authenticate, requireHR } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get all calendar entries (optionally filtered by year)
router.get('/', leaveCalendarController.getAllCalendarEntries);

// Get calendar entries for a specific year
router.get('/year/:year', leaveCalendarController.getCalendarByYear);

// Get calendar entries within a date range
router.get('/range', leaveCalendarController.getCalendarByDateRange);

// Get holiday count between two dates
router.get('/holiday-count', leaveCalendarController.getHolidayCount);

// Check if a date is a holiday
router.get('/check-holiday', leaveCalendarController.checkIsHoliday);

// Create, update, delete - only HR can manage
router.post('/', requireHR, leaveCalendarController.createCalendarEntry);
router.put('/:id', requireHR, leaveCalendarController.updateCalendarEntry);
router.delete('/:id', requireHR, leaveCalendarController.deleteCalendarEntry);

export default router;
