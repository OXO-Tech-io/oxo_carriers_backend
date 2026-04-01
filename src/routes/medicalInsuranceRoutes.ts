import { Router } from 'express';
import * as medicalInsuranceController from '../controllers/medicalInsuranceController';
import { authenticate, requireHR } from '../middleware/auth';
import { uploadMedicalDocuments } from '../middleware/upload';

const router = Router();

router.use(authenticate);

router.get('/limits', medicalInsuranceController.getLimits);
router.get('/', medicalInsuranceController.getClaims);
router.get('/:id', medicalInsuranceController.getById);
router.post('/', uploadMedicalDocuments, medicalInsuranceController.apply);
router.put('/:id/approve', requireHR, medicalInsuranceController.approve);
router.put('/:id/reject', requireHR, medicalInsuranceController.reject);
router.post('/:id/resubmit', uploadMedicalDocuments, medicalInsuranceController.resubmit);

export default router;
