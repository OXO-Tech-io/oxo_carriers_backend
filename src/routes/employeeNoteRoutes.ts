import { Router } from 'express';
import * as employeeNoteController from '../controllers/employeeNoteController';
import { authenticate, requireHRManager } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { uploadNoteAttachments } from '../middleware/upload';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createEmployeeNoteSchema,
  updateEmployeeNoteSchema,
  employeeNoteIdParamSchema,
  employeeUserIdParamSchema,
} from '../validators/employeeNote.validator';

const router = Router();

router.use(authenticate);

// Create is open to hr_executive/hr_manager/super_admin (checked in the
// controller itself); there is deliberately no list/view/edit route
// reachable by hr_executive - only hr_manager/super_admin below.
router.post(
  '/',
  uploadNoteAttachments,
  validate(createEmployeeNoteSchema, 'body'),
  asyncHandler(employeeNoteController.create)
);

router.get(
  '/employee/:employeeUserId',
  requireHRManager,
  validate(employeeUserIdParamSchema, 'params'),
  asyncHandler(employeeNoteController.listForEmployee)
);

router.get(
  '/:id',
  requireHRManager,
  validate(employeeNoteIdParamSchema, 'params'),
  asyncHandler(employeeNoteController.getById)
);

router.put(
  '/:id',
  requireHRManager,
  validate(employeeNoteIdParamSchema, 'params'),
  validate(updateEmployeeNoteSchema, 'body'),
  asyncHandler(employeeNoteController.update)
);

export default router;
