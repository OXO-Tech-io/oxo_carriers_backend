import { Router } from 'express';
import * as consultantSubmissionController from '../controllers/consultantSubmissionController';
import { authenticate, requireHR } from '../middleware/auth';
import { uploadConsultantLogSheet } from '../middleware/upload';
import { requireEmployeeId, validateRequiredFields } from '../middleware/validation';

const router = Router();

router.use(authenticate);

router.get('/', consultantSubmissionController.getSubmissions);
router.get('/:id', consultantSubmissionController.getSubmissionById);
router.post(
  '/',
  requireEmployeeId,
  uploadConsultantLogSheet,
  validateRequiredFields(['project', 'tech', 'total_hours']),
  consultantSubmissionController.submit
);
router.put('/:id/decision', requireHR, consultantSubmissionController.decideSubmission);
router.post('/:id/resubmit', requireEmployeeId, uploadConsultantLogSheet, consultantSubmissionController.resubmit);

export default router;
