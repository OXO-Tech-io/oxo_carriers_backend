import { Router } from 'express';
import * as leaveController from '../controllers/leaveController';
import { authenticate, requireHR } from '../middleware/auth';
import { uploadDocument } from '../middleware/upload';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/types', leaveController.getLeaveTypes);
router.get('/balance', leaveController.getLeaveBalance);
router.get('/', leaveController.getLeaveRequests);
router.get('/:id', leaveController.getLeaveRequestById);
router.post('/', uploadDocument, leaveController.createLeaveRequest);
// Allow HR and team leaders to approve (team leaders identified by having employees reporting to them)
router.put('/:id/approve', authenticate, leaveController.approveLeaveRequest);
router.put('/:id/reject', requireHR, leaveController.rejectLeaveRequest);

export default router;
