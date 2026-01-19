import { Router } from 'express';
import * as userController from '../controllers/userController';
import { authenticate, requireHRManager, requireHR } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', requireHR, userController.getAllUsers);
router.get('/departments', requireHR, userController.getDepartments);
router.get('/:id', userController.getUserById);
router.post('/', requireHR, userController.createUser);
router.put('/:id', userController.updateUser);
router.post('/:id/reset-password', requireHR, userController.resetUserPassword);
router.delete('/:id', requireHRManager, userController.deleteUser);

export default router;
