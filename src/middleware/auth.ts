import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload, UserRole } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      file?: Express.Multer.File;
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET || 'your-secret-key';

    const decoded = jwt.verify(token, secret) as JwtPayload;
    // console.log(`[Auth] ✅ Authenticated user: ${decoded.email} (${decoded.role})`);
    req.user = decoded;
    next();
  } catch (error) {
    console.warn('[Auth] ❌ Invalid or expired token');
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

export const authorize = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions' });
    }

    next();
  };
};

export const requireHRManager = authorize(UserRole.HR_MANAGER);
export const requireHRExecutive = authorize(UserRole.HR_EXECUTIVE);
export const requireHR = authorize(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE);
export const requireHROrFinance = authorize(
  UserRole.HR_MANAGER,
  UserRole.HR_EXECUTIVE,
  UserRole.FINANCE_MANAGER,
  UserRole.FINANCE_EXECUTIVE
);
