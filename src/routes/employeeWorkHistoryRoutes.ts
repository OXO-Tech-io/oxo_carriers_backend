import { Router } from 'express';
import * as employeeWorkHistoryController from '../controllers/employeeWorkHistoryController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { listWorkHistoryQuerySchema } from '../validators/employeeWorkHistory.validator';

const router = Router();

router.use(authenticate);

// No route-level role gate - the service branches self-vs-HR access, matching
// the `leaves` module's GET / precedent. There are deliberately no direct
// write endpoints here: every mutation goes through profile-change-requests.
router.get(
  '/',
  validate(listWorkHistoryQuerySchema, 'query'),
  asyncHandler(employeeWorkHistoryController.listMine)
);

router.get(
  '/experience-summary',
  validate(listWorkHistoryQuerySchema, 'query'),
  asyncHandler(employeeWorkHistoryController.getExperienceSummary)
);

export default router;
