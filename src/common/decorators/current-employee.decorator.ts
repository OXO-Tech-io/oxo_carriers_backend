import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../../types';

/** Injects the authenticated employee (set by JwtAuthGuard) into a handler param. */
export const CurrentEmployee = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.employee;
  },
);
