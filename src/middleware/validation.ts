import { Request, Response, NextFunction } from 'express';

/**
 * Rejects the request before it reaches the controller if the authenticated
 * employee has no employee_id linked yet (e.g. a Keycloak account that was
 * verified but never attached to an HR-created employee record).
 */
export const requireEmployeeId = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.employee?.employeeId) {
    res.status(400).json({ success: false, message: 'Employee ID not found on this account' });
    return;
  }
  next();
};

/**
 * Rejects the request before it reaches the controller if any of the given
 * top-level req.body fields are missing/blank. Place AFTER any body-parsing
 * middleware (e.g. multer) so multipart fields are already populated.
 */
export const validateRequiredFields = (fields: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const missing = fields.filter((field) => {
      const value = req.body?.[field];
      return value === undefined || value === null || (typeof value === 'string' && !value.trim());
    });
    if (missing.length > 0) {
      res.status(400).json({ success: false, message: `Missing required fields: ${missing.join(', ')}` });
      return;
    }
    next();
  };
