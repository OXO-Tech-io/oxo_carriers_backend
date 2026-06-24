import { Router } from 'express';
import * as userController from '../controllers/userController';
import * as employeePiiController from '../controllers/employeePiiController';
import { authenticate, requireHRManager, requireHR, requireHROrFinance, requireSuperAdmin } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', requireHROrFinance, userController.getAllUsers);
router.get('/departments', requireHROrFinance, userController.getDepartments);
router.get('/:id/pii', employeePiiController.getEmployeePii);
router.put('/:id/pii', employeePiiController.upsertEmployeePii);
router.get('/:id', userController.getUserById);
router.post('/', requireHROrFinance, userController.createUser);
router.post('/:id/keycloak', requireHR, userController.provisionKeycloakUser);
router.put('/:id', userController.updateUser);
router.patch('/:id/role', requireSuperAdmin, userController.updateUserRole);
router.post('/:id/reset-password', requireHR, userController.resetUserPassword);
router.delete('/:id', requireHRManager, userController.deleteUser);

export default router;
