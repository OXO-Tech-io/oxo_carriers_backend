import { Router } from 'express';
import * as leaveController from '../controllers/leaveController';
import { authenticate, requireHR } from '../middleware/auth';
import { uploadDocument } from '../middleware/upload';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import {
  approveLeaveRequestSchema,
  createLeaveRequestSchema,
  leaveBalanceQuerySchema,
  leaveIdParamSchema,
  listLeaveRequestsQuerySchema,
  rejectLeaveRequestSchema,
} from '../validators/leave.validator';

const router = Router();

router.use(authenticate);

router.get('/types', asyncHandler(leaveController.getLeaveTypes));

router.get(
  '/balance',
  validate(leaveBalanceQuerySchema, 'query'),
  asyncHandler(leaveController.getLeaveBalance)
);

router.get(
  '/',
  validate(listLeaveRequestsQuerySchema, 'query'),
  asyncHandler(leaveController.getLeaveRequests)
);

router.get(
  '/:id',
  validate(leaveIdParamSchema, 'params'),
  asyncHandler(leaveController.getLeaveRequestById)
);

router.post(
  '/',
  uploadDocument,
  validate(createLeaveRequestSchema, 'body'),
  asyncHandler(leaveController.createLeaveRequest)
);

router.put(
  '/:id/approve',
  validate(leaveIdParamSchema, 'params'),
  validate(approveLeaveRequestSchema, 'body'),
  asyncHandler(leaveController.approveLeaveRequest)
);

router.put(
  '/:id/reject',
  requireHR,
  validate(leaveIdParamSchema, 'params'),
  validate(rejectLeaveRequestSchema, 'body'),
  asyncHandler(leaveController.rejectLeaveRequest)
);

export default router;
