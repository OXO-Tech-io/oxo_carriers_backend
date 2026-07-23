import { Router } from 'express';
import * as employeeEmergencyContactController from '../controllers/employeeEmergencyContactController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { employeeIdParamSchema } from '../validators/employeeEducation.validator';

// Mounted at /api/employees/:employeeId/emergency-contacts - mergeParams so
// the :employeeId from the parent path is visible on req.params here.
const router = Router({ mergeParams: true });

router.use(authenticate);

// No route-level role gate - the service branches self-vs-HR access, matching
// the employee-education/work-history precedent. There are deliberately no
// direct write endpoints here: every mutation goes through profile-change-requests.
router.get('/', validate(employeeIdParamSchema, 'params'), asyncHandler(employeeEmergencyContactController.list));

export default router;
