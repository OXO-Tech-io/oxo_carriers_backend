import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';
import { logger as baseLogger } from '../lib/logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
    return;
  }

  // Prefer the per-request logger (carries req.id) when available.
  const log = (req as Request & { log?: typeof baseLogger }).log ?? baseLogger;
  log.error({ err }, 'Unhandled error');

  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: env.IS_DEVELOPMENT ? err.message : undefined,
  });
};
