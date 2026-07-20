import { Router } from 'express';
import * as employeePiiController from '../controllers/employeePiiController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.use(authenticate);

// Read-only on purpose: `upsertEmployeePii` is intentionally NOT routed here.
// Address is one of the fields gated behind the profile change approval
// workflow (see profileChangeRequestRoutes.ts) - leaving the write endpoint
// unmounted is what makes "address is never directly editable" actually true.
router.get('/:id', asyncHandler(employeePiiController.getEmployeePii));

export default router;
