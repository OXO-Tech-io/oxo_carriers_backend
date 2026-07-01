import { Router } from 'express';
import * as employeeController from '../controllers/employeeController';
import { authenticate, requireHRManager, requireHR, requireHROrFinance } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', requireHROrFinance, employeeController.getAllEmployees);
router.get('/:employeeId', employeeController.getEmployeeByEmployeeId);
router.post('/', requireHR, employeeController.createEmployee);
router.put('/:employeeId', employeeController.updateEmployee);
router.delete('/:employeeId', requireHRManager, employeeController.deleteEmployee);

export default router;
