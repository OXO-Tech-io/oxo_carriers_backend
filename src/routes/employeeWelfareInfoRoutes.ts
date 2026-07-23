import { Router } from 'express';
import * as employeeWelfareInfoController from '../controllers/employeeWelfareInfoController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { employeeIdParamSchema } from '../validators/employeeEducation.validator';

// Mounted at /api/employees/:employeeId/welfare-info - mergeParams so the
// :employeeId from the parent path is visible on req.params here.
const router = Router({ mergeParams: true });

router.use(authenticate);

// No route-level role gate - the service branches self-vs-HR access, matching
// the employee-education/work-history precedent. There are deliberately no
// direct write endpoints here: every mutation goes through profile-change-requests.
router.get('/', validate(employeeIdParamSchema, 'params'), asyncHandler(employeeWelfareInfoController.get));

export default router;
