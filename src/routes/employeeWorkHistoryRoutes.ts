import { Router } from 'express';
import * as employeeWorkHistoryController from '../controllers/employeeWorkHistoryController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { employeeIdParamSchema } from '../validators/employeeWorkHistory.validator';

// Mounted at /api/employees/:employeeId/work-histories - mergeParams so the
// :employeeId from the parent path is visible on req.params here.
const router = Router({ mergeParams: true });

router.use(authenticate);

// No route-level role gate - the service branches self-vs-HR access, matching
// the `leaves` module's GET / precedent. There are deliberately no direct
// write endpoints here: every mutation goes through profile-change-requests.
router.get(
  '/',
  validate(employeeIdParamSchema, 'params'),
  asyncHandler(employeeWorkHistoryController.list)
);

router.get(
  '/experience-summary',
  validate(employeeIdParamSchema, 'params'),
  asyncHandler(employeeWorkHistoryController.getExperienceSummary)
);

export default router;
