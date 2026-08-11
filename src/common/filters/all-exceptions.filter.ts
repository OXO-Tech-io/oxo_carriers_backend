import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../utils/AppError';
import { env } from '../../config/env';
import { logger as baseLogger } from '../../lib/logger';

/**
 * Nest equivalent of the old Express `errorHandler` middleware - same
 * response shape ({ success, message, ... }) for every branch so existing
 * frontend error handling keeps working unchanged.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof ZodError) {
      response.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: exception.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    if (exception instanceof AppError) {
      response.status(exception.statusCode).json({
        success: false,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'string' ? body : (body as { message?: string | string[] }).message ?? exception.message;
      response.status(status).json({
        success: false,
        message: Array.isArray(message) ? message.join(', ') : message,
      });
      return;
    }

    const log = request?.log ?? baseLogger;
    log.error({ err: exception }, 'Unhandled error');

    response.status(500).json({
      success: false,
      message: 'Internal server error',
      error: env.IS_DEVELOPMENT ? (exception as Error)?.message : undefined,
    });
  }
}
