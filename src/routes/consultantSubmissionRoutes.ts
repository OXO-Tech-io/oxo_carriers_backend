import { Router } from 'express';
import * as consultantSubmissionController from '../controllers/consultantSubmissionController';
import { authenticate, requireHR } from '../middleware/auth';
import { uploadConsultantLogSheet } from '../middleware/upload';

const router = Router();

router.use(authenticate);

router.get('/', consultantSubmissionController.getSubmissions);
router.get('/:id', consultantSubmissionController.getById);
router.post('/', uploadConsultantLogSheet, consultantSubmissionController.submit);
router.put('/:id/approve', requireHR, consultantSubmissionController.approve);
router.put('/:id/reject', requireHR, consultantSubmissionController.reject);
router.post('/:id/resubmit', uploadConsultantLogSheet, consultantSubmissionController.resubmit);

export default router;
