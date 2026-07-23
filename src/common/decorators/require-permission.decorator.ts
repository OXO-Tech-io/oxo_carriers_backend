import { SetMetadata } from '@nestjs/common';
import { AccessLevel, PermissionKey } from '../../constants/permissions';

export const PERMISSION_KEY = 'requiredPermission';

export interface RequiredPermission {
  key: PermissionKey;
  level: AccessLevel;
}

/**
 * Nest equivalent of the old per-domain `requireXRead`/`requireXWrite`
 * Express middleware (see permissionRoutes.ts, groupRoutes.ts) - gates a
 * route on the caller holding a given permission key at a given access
 * level (checked via `tbl_user_permissions`). Super admins always bypass
 * (enforced in PermissionGuard), matching the original behaviour.
 */
export const RequirePermission = (key: PermissionKey, level: AccessLevel = 'read') =>
  SetMetadata(PERMISSION_KEY, { key, level } satisfies RequiredPermission);
