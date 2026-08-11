import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole } from '../../types';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Nest equivalent of the old `authorize(...roles)` Express middleware.
 * Super admins always pass regardless of the roles list. Routes with no
 * @Roles() metadata are left to JwtAuthGuard alone (authenticated but
 * unrestricted), matching routes that only had `authenticate` applied.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (!request.employee) {
      throw new UnauthorizedException('Unauthorized');
    }
    if (request.employee.role === UserRole.SUPER_ADMIN) return true;
    if (!requiredRoles.includes(request.employee.role)) {
      throw new ForbiddenException('Forbidden: Insufficient permissions');
    }
    return true;
  }
}
