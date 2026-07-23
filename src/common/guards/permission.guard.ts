import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole } from '../../types';
import { hasPermission } from '../../middleware/permissions';
import { PERMISSION_KEY, RequiredPermission } from '../decorators/require-permission.decorator';

/**
 * Nest equivalent of the old `requirePermissionsRead`/`requirePermissionsWrite`
 * and `requireGroupsRead`/`requireGroupsWrite` Express middleware factories -
 * checks the caller's `tbl_user_permissions` assignment for the permission
 * key/level set via @RequirePermission(). Super admins always pass, matching
 * the original `role === 'super_admin'` bypass.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (!request.employee) {
      throw new UnauthorizedException('Unauthorized');
    }
    if (request.employee.role === UserRole.SUPER_ADMIN) return true;

    const allowed = await hasPermission(request.employee.userId, required.key, required.level);
    if (!allowed) {
      throw new ForbiddenException('Forbidden');
    }
    return true;
  }
}
