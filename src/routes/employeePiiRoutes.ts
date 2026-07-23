import { Router } from 'express';
import * as employeePiiController from '../controllers/employeePiiController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { userIdParamSchema } from '../validators/employeePii.validator';

// Mounted at /api/employee-pii/:userId - fixes a pre-existing gap where the
// frontend's profileService.getEmployeePii called this path but no matching
// backend route existed (PII was only ever returned inline from GET /users/:id).
const router = Router();

router.use(authenticate);

router.get('/:userId', validate(userIdParamSchema, 'params'), asyncHandler(employeePiiController.getByUserId));

export default router;
