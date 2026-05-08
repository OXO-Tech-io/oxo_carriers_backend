import { Router } from 'express';
import * as authController from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Identity is owned by Keycloak. The only endpoint we expose is /me, which
// returns the DB profile linked to the verified Keycloak token.
router.get('/me', authenticate, asyncHandler(authController.getMe));

export default router;
