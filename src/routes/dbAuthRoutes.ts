import { Router } from 'express';
import * as dbAuthController from '../controllers/dbAuthController';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyJWT } from '../controllers/dbAuthController';

const router = Router();

/**
 * POST /api/auth/login
 * Login with email and password against Google Cloud SQL database
 * Body: { email: string, password: string }
 * Response: { token, userId, email, firstName, lastName, role, expiresIn }
 */
router.post('/login', asyncHandler(dbAuthController.login));

/**
 * POST /api/auth/logout
 * Logout endpoint (client removes token)
 */
router.post('/logout', asyncHandler(dbAuthController.logout));

/**
 * POST /api/auth/verify-token
 * Verify if JWT token is still valid
 */
router.post('/verify-token', asyncHandler(dbAuthController.verifyToken));

/**
 * GET /api/auth/me
 * Get current user profile (requires valid JWT)
 */
router.get('/me', verifyJWT, asyncHandler(async (req, res) => {
    const user = (req as any).user;
    res.json({
        success: true,
        data: {
            userId: user.userId,
            email: user.email,
            role: user.role,
            employeeId: user.employeeId,
        },
    });
}));

export default router;
