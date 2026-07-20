import { Router } from 'express';
import * as employeeEducationController from '../controllers/employeeEducationController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { listEducationQuerySchema } from '../validators/employeeEducation.validator';

const router = Router();

router.use(authenticate);

// No route-level role gate - the service branches self-vs-HR access, matching
// the `leaves` module's GET / precedent. There are deliberately no direct
// write endpoints here: every mutation goes through profile-change-requests.
router.get(
  '/',
  validate(listEducationQuerySchema, 'query'),
  asyncHandler(employeeEducationController.listMine)
);

export default router;
