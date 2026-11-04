import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { isOriginAllowed } from '../../config/corsOrigins';
import { SessionAction } from '../../types';

export interface AttendancePushEvent {
  type: SessionAction;
  employeeId: string;
  occurredAt: string;
}

/**
 * Pushes in/out/break events to whichever local-PC agent is connected for a
 * given device id. HRIS (this backend) is always the origin of the event -
 * see AttendanceService.pushEvent - this gateway only fans it out.
 *
 * No agent implementation exists yet, so the handshake is deliberately the
 * simplest thing that works: connect to the `/attendance` namespace with
 * `deviceId` in the query string or auth payload. Whoever builds the agent
 * later should replace this with a real credential exchange - as it stands,
 * any client that knows a deviceId can claim it.
 */
@WebSocketGateway({
  namespace: '/attendance',
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
      callback(null, isOriginAllowed(origin));
    },
    credentials: true,
  },
})
export class AttendanceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AttendanceGateway.name);

  @WebSocketServer()
  server!: Server;

  /** One connection per device id; a newer connection for the same id replaces the older one. */
  private readonly clientsByDeviceId = new Map<string, Socket>();

  handleConnection(client: Socket): void {
    const deviceId = this.readDeviceId(client);
    if (!deviceId) {
      this.logger.warn(`Rejecting connection ${client.id}: no deviceId supplied`);
      client.disconnect(true);
      return;
    }

    const existing = this.clientsByDeviceId.get(deviceId);
    if (existing && existing.id !== client.id) {
      existing.disconnect(true);
    }
    this.clientsByDeviceId.set(deviceId, client);
    client.data.deviceId = deviceId;
    this.logger.log(`Device connected: ${deviceId} (socket ${client.id})`);
  }

  handleDisconnect(client: Socket): void {
    const deviceId = client.data?.deviceId as string | undefined;
    if (deviceId && this.clientsByDeviceId.get(deviceId)?.id === client.id) {
      this.clientsByDeviceId.delete(deviceId);
      this.logger.log(`Device disconnected: ${deviceId}`);
    }
  }

  /**
   * Fire-and-forget: a device that isn't currently connected simply misses the
   * event. HRIS is the source of truth and the action that triggered this has
   * already succeeded, so a missing socket is never a reason to fail it.
   */
  pushToDevice(deviceId: string | null | undefined, event: AttendancePushEvent): boolean {
    if (!deviceId) return false;
    const client = this.clientsByDeviceId.get(deviceId);
    if (!client) {
      this.logger.debug(`No connected device "${deviceId}"; dropping ${event.type} event`);
      return false;
    }
    client.emit('attendance:event', event);
    return true;
  }

  isDeviceConnected(deviceId: string | null | undefined): boolean {
    return !!deviceId && this.clientsByDeviceId.has(deviceId);
  }

  private readDeviceId(client: Socket): string | null {
    const fromQuery = client.handshake.query?.deviceId;
    const fromAuth = (client.handshake.auth as Record<string, unknown> | undefined)?.deviceId;
    const raw = (Array.isArray(fromQuery) ? fromQuery[0] : fromQuery) ?? fromAuth;
    const deviceId = typeof raw === 'string' ? raw.trim() : '';
    return deviceId.length > 0 ? deviceId : null;
  }
}
