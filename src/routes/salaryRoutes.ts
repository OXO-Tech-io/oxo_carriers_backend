import { Router } from 'express';
import * as salaryController from '../controllers/salaryController';
import { authenticate, requireHRManager, requireHR } from '../middleware/auth';
import { uploadExcel } from '../middleware/upload';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/components', salaryController.getSalaryComponents);
router.get('/ytd', salaryController.getYearToDateEarnings);
router.get('/', salaryController.getSalaries);
router.get('/:id', salaryController.getSalaryById);
router.get('/:id/pdf', salaryController.generateSalarySlipPDF);
router.get('/structure/:userId', salaryController.getEmployeeSalaryStructure);
router.post('/generate', requireHR, salaryController.generateSalary);
router.post('/bulk-upload', requireHR, uploadExcel, salaryController.uploadBulkSalaries);
router.put('/structure/:userId', requireHRManager, salaryController.updateSalaryStructure);
router.put('/:id/status', requireHR, salaryController.updateSalaryStatus);

export default router;
