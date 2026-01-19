import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authenticate, requireHRManager } from '../middleware/auth';

const router = Router();

// Public routes
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/verify-email', authController.verifyEmail);

// Protected routes
router.post('/register', authenticate, requireHRManager, authController.register);
router.post('/change-password', authenticate, authController.changePassword);
router.get('/me', authenticate, authController.getMe);

export default router;
