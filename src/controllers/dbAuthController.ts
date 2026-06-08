import { Request, Response } from 'express';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { logger } from '../lib/logger';
import { BadRequestError, UnauthorizedError } from '../utils/AppError';
import { ok } from '../utils/response';

// Database connection pool (from your database.ts)
let pool: Pool;

export const initAuthPool = (dbPool: Pool) => {
    pool = dbPool;
};

/**
 * Interface for login request body
 */
export interface LoginRequest {
    email: string;
    password: string;
}

/**
 * Interface for login response
 */
export interface LoginResponse {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    employeeId: string;
    token: string;
    expiresIn: number;
}

/**
 * POST /api/auth/login
 * 
 * Login endpoint: Check user in Google Cloud SQL database and issue JWT token
 * 
 * @param req.body.email - User email
 * @param req.body.password - User password (plain text, will be compared with bcrypt hash)
 * @returns JWT token, user details, and session expiry
 */
export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body as LoginRequest;

        // Validation
        if (!email || !password) {
            throw new BadRequestError('Email and password are required');
        }

        if (!email.includes('@')) {
            throw new BadRequestError('Invalid email format');
        }

        if (password.length < 6) {
            throw new BadRequestError('Invalid credentials');
        }

        logger.debug(`[AUTH] Login attempt for email: ${email}`);

        // Query hris.users table from Google Cloud SQL
        const query = `
      SELECT 
        id,
        email,
        password,
        first_name,
        last_name,
        role,
        employee_id,
        email_verified,
        must_change_password
      FROM hris."users"
      WHERE email = $1
      LIMIT 1
    `;

        const result = await pool.query(query, [email]);

        if (result.rows.length === 0) {
            logger.warn(`[AUTH] Login failed: User not found - ${email}`);
            throw new UnauthorizedError('Invalid email or password');
        }

        const user = result.rows[0];

        // Verify password using bcrypt
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            logger.warn(`[AUTH] Login failed: Invalid password for ${email}`);
            throw new UnauthorizedError('Invalid email or password');
        }

        // Check if email is verified (optional - customize based on your requirements)
        if (!user.email_verified) {
            logger.info(`[AUTH] User ${email} attempting login with unverified email`);
            // Uncomment below to enforce email verification before login
            // throw new UnauthorizedError('Please verify your email before logging in');
        }

        // Generate JWT token
        const tokenPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            employeeId: user.employee_id,
            iat: Math.floor(Date.now() / 1000),
        };

        const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
        const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '24h') as `${number}${'s' | 'm' | 'h' | 'd' | 'w' | 'y'}`;

        const token = jwt.sign(tokenPayload, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN,
            algorithm: 'HS256',
        });

        // Calculate token expiry time
        const expiresIn = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

        logger.info(`[AUTH] Successful login for ${email} with role: ${user.role}`);

        // Return success response with token and user details
        const response: LoginResponse = {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role,
            employeeId: user.employee_id,
            token,
            expiresIn,
        };

        ok(res, response, 'Login successful');
    } catch (error) {
        if (error instanceof BadRequestError || error instanceof UnauthorizedError) {
            throw error;
        }
        logger.error(`[AUTH] Login error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw new UnauthorizedError('Login failed. Please try again.');
    }
};

/**
 * POST /api/auth/logout
 * 
 * Logout endpoint: Invalidate session (client-side token removal)
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
    logger.info(`[AUTH] User logged out`);
    ok(res, { message: 'Logged out successfully' }, 'Logout successful');
};

/**
 * POST /api/auth/verify-token
 * 
 * Verify JWT token validity
 */
export const verifyToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith('Bearer ')) {
            throw new UnauthorizedError('No token provided');
        }

        const token = authHeader.substring(7);
        const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

        const decoded = jwt.verify(token, JWT_SECRET) as any;

        ok(res, { valid: true, userId: decoded.userId, email: decoded.email }, 'Token is valid');
    } catch (error) {
        logger.warn(`[AUTH] Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        throw new UnauthorizedError('Invalid or expired token');
    }
};

/**
 * Middleware: Verify JWT token and attach user to request
 */
export const verifyJWT = (req: Request, res: Response, next: Function) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith('Bearer ')) {
            res.status(401).json({ success: false, message: 'No token provided' });
            return;
        }

        const token = authHeader.substring(7);
        const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

        const decoded = jwt.verify(token, JWT_SECRET) as any;

        (req as any).user = {
            userId: decoded.userId,
            email: decoded.email,
            role: decoded.role,
            employeeId: decoded.employeeId,
        };

        next();
    } catch (error) {
        res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};
