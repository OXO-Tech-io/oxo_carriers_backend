import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { verifyKeycloakToken } from '../../middleware/keycloakAuth';
import { EmployeesService } from '../../employees/employees.service';
import { UserRole } from '../../types';
import { logger as baseLogger } from '../../lib/logger';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

const ROLE_PRIORITY: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.HR_MANAGER,
  UserRole.HR_EXECUTIVE,
  UserRole.FINANCE_MANAGER,
  UserRole.FINANCE_EXECUTIVE,
  UserRole.EMPLOYEE,
  UserRole.CONSULTANT,
  UserRole.SERVICE_PROVIDER,
];

const extractAllKeycloakRoles = (claims: {
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
}): string[] => {
  const roleSet = new Set<string>();
  claims.realm_access?.roles?.forEach((role) => roleSet.add(role));
  Object.values(claims.resource_access ?? {}).forEach((resource) => {
    resource.roles?.forEach((role) => roleSet.add(role));
  });
  return [...roleSet];
};

const mapKeycloakRoles = (roles: string[] | undefined): UserRole => {
  if (!roles || roles.length === 0) return UserRole.EMPLOYEE;
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return UserRole.EMPLOYEE;
};

/**
 * Verifies the Keycloak bearer token and resolves it against the local
 * tbl_employee table, attaching the result to `request.employee` - the Nest
 * equivalent of the old `authenticate` Express middleware.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly employeesService: EmployeesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const log = request.log ?? baseLogger;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided');
    }

    const token = authHeader.substring(7);

    let claims;
    try {
      ({ claims } = await verifyKeycloakToken(token));
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'Token verification failed');
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!claims.email) {
      throw new UnauthorizedException('Token missing email claim');
    }

    const role = mapKeycloakRoles(extractAllKeycloakRoles(claims));

    const existingBySub = await this.employeesService.findByKeycloakSub(claims.sub);
    let employee = existingBySub;
    let dbResolution = 'existing_by_sub';

    if (!employee) {
      const existingByEmail = await this.employeesService.findByEmail(claims.email);
      if (existingByEmail) {
        await this.employeesService.linkKeycloakSub(existingByEmail.id, claims.sub);
        employee = { ...existingByEmail, keycloakSub: claims.sub };
        dbResolution = 'existing_by_email_linked_sub';
      }
    }

    if (!employee) {
      log.warn({ keycloakSub: claims.sub, email: claims.email }, 'User not found in system database');
      throw new UnauthorizedException(
        'User is authenticated at Keycloak but is not registered in this system.',
      );
    }

    // Blocked even with a still-valid JWT - the Keycloak account itself is
    // also disabled when status is set away from 'active' (see
    // keycloakAdminService.setEnabled), but that alone doesn't invalidate
    // tokens already issued before the account was disabled.
    if (employee.status !== 'active') {
      log.warn({ keycloakSub: claims.sub, email: claims.email, status: employee.status }, 'Blocked login for non-active employee');
      throw new UnauthorizedException(
        employee.status === 'on_hold'
          ? 'Your account is on hold. Contact HR for assistance.'
          : 'Your account is inactive. Contact HR for assistance.',
      );
    }

    log.info(
      {
        keycloakSub: claims.sub,
        email: claims.email,
        dbResolution,
        userId: employee.id,
        role: employee.role,
      },
      'Keycloak token authenticated and resolved against users table',
    );

    // Note: `role` above is derived from the Keycloak token's realm/resource
    // roles but is intentionally NOT used here - matches the original
    // `authenticate` middleware, which always trusts the DB row's role
    // rather than the token's role claims.
    request.employee = {
      userId: employee.id,
      employeeId: employee.employeeId ?? null,
      email: employee.email,
      role: employee.role as UserRole,
      sub: claims.sub,
    };

    return true;
  }
}
