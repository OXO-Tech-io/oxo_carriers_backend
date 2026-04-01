import { Router } from 'express';
import { FacilityController } from '../controllers/facilityController';
import { authenticate, requireHR } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Facility routes
router.get('/', FacilityController.getAllFacilities);
router.get('/available', FacilityController.getAvailable);
router.post('/', requireHR, FacilityController.createFacility);
router.put('/:id', requireHR, FacilityController.updateFacility);
router.delete('/:id', requireHR, FacilityController.deleteFacility);

// Booking routes
router.post('/book', FacilityController.createBooking);
router.get('/my-bookings', FacilityController.getMyBookings);
router.get('/all-bookings', FacilityController.getAllBookings);
router.put('/bookings/:id/cancel', FacilityController.cancelBooking);

export default router;
