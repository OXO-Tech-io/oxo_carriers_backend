import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Request } from 'express';
import { db } from '../../../db';
import { agentDeviceTokens } from '../../../db/schema';
import { EmployeeModel } from '../../../employees/Employee';
import { EmployeeStatus } from '../../../types';

export interface EmployeeDeviceIdentity {
  employeeId: string;
  deviceId: string;
}

export type AgentDeviceRequest = Request & { agentDevice?: EmployeeDeviceIdentity };

export const hashDeviceToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Authenticates the activity agent itself (no user session) by a per-device bearer token.
 * Pair with @Public() so the global Keycloak JwtAuthGuard steps aside. The identity is
 * the stored token row - and the device HR currently assigns to that employee - never
 * anything in the request body.
 */
@Injectable()
export class AgentDeviceGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AgentDeviceRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('No device token provided');

    const [row] = await db
      .select()
      .from(agentDeviceTokens)
      .where(and(eq(agentDeviceTokens.tokenHash, hashDeviceToken(header.substring(7))), isNull(agentDeviceTokens.revokedAt)))
      .limit(1);
    if (!row) throw new UnauthorizedException('Invalid device token');

    // Token is void if HR reassigned the device or the employee is no longer active.
    const employee = await EmployeeModel.findByEmployeeId(row.employeeId);
    const assigned = employee?.deviceId?.trim().toLowerCase();
    if (!employee || employee.status !== EmployeeStatus.ACTIVE || assigned !== row.deviceId.toLowerCase()) {
      throw new UnauthorizedException('Device token is no longer valid');
    }

    // Best-effort; failing to stamp last-used must not reject the upload.
    void db
      .update(agentDeviceTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(agentDeviceTokens.id, row.id))
      .catch(() => undefined);

    request.agentDevice = { employeeId: row.employeeId, deviceId: row.deviceId };
    return true;
  }
}
