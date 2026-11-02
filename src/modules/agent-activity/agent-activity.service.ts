import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { and, count, desc, eq, gte, isNull, lt, max, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import { agentActivityLogs, agentDeviceTokens, agentScreenshots } from '../../db/schema';
import { EmployeeModel } from '../../employees/Employee';
import { AgentLogDto } from './dto/ingest-agent-logs.dto';
import { GetAgentLogsQueryDto } from './dto/get-agent-logs-query.dto';
import { ConfirmScreenshotUploadDto, RequestScreenshotUploadDto } from './dto/agent-screenshot-upload.dto';
import { MAX_SCREENSHOT_BYTES } from './agent-activity.constants';
import { AgentDeviceIdentity, hashDeviceToken } from './guards/agent-device.guard';
import {
  deletePrivateObject,
  downloadPrivateObject,
  getPrivateObjectSignedUrl,
  getPrivateObjectSize,
  getPrivateObjectUploadUrl,
  isSecureBucketConfigured,
  uploadPrivateObject,
} from '../../lib/storage/gcsStorage';
import { logger } from '../../lib/logger';

// The agent emits "Heartbeat" but lowercase everywhere else - normalise so filters
// and the UI don't have to care.
const normaliseEventType = (type: string) => type.trim().toLowerCase();

export { MAX_SCREENSHOT_BYTES };

@Injectable()
export class AgentActivityService {
  /**
   * Stores a batch the employee's browser relayed from their local agent. A log only
   * counts if its deviceId is the one HR assigned to this employee, so one employee
   * cannot submit rows under another's device. Replays (same device + agent id) are
   * ignored, which makes browser reconnects and multiple open tabs harmless.
   */
  async ingest(employeeId: string, logs: AgentLogDto[]) {
    const employee = await EmployeeModel.findByEmployeeId(employeeId);
    const assignedDeviceId = employee?.deviceId?.trim();
    if (!assignedDeviceId) {
      throw new ForbiddenException('No device ID is assigned to your account');
    }

    // The agent reports its device GUID upper-cased; HR may have typed it in any case.
    const accepted = logs.filter((log) => log.deviceId.trim().toLowerCase() === assignedDeviceId.toLowerCase());
    if (accepted.length === 0) {
      return { received: logs.length, stored: 0, rejected: logs.length };
    }

    const inserted = await db
      .insert(agentActivityLogs)
      .values(
        accepted.map((log) => ({
          employeeId,
          deviceId: assignedDeviceId,
          agentLogId: log.id,
          eventType: normaliseEventType(log.eventType),
          startTs: new Date(log.startTs),
          appName: log.appName ?? null,
          windowTitle: log.windowTitle?.slice(0, 500) ?? null,
          mouseEventCount: log.mouseEventCount ?? 0,
          keyEventCount: log.keyEventCount ?? 0,
          mediaState: log.mediaState ?? null,
        })),
      )
      .onConflictDoNothing({ target: [agentActivityLogs.deviceId, agentActivityLogs.agentLogId] })
      .returning({ id: agentActivityLogs.id });

    return { received: logs.length, stored: inserted.length, rejected: logs.length - accepted.length };
  }

  /**
   * Agent upload step 1: hands the device a short-lived signed PUT URL for a deterministic
   * object key. Requires the bucket - without it there is nowhere for the agent to PUT.
   */
  async requestScreenshotUpload(device: AgentDeviceIdentity, dto: RequestScreenshotUploadDto) {
    if (!isSecureBucketConfigured()) throw new BadRequestException('Screenshot storage is not configured');
    const objectKey = this.screenshotObjectKey(device.deviceId, dto);
    const uploadUrl = await getPrivateObjectUploadUrl(objectKey, dto.mimeType);
    return { uploadUrl, objectKey, requiredHeaders: { 'Content-Type': dto.mimeType }, expiresInSeconds: 600 };
  }

  /** Agent upload step 3: verifies the object really landed (and is within the cap) before writing the row. */
  async confirmScreenshotUpload(device: AgentDeviceIdentity, dto: ConfirmScreenshotUploadDto) {
    const objectKey = this.screenshotObjectKey(device.deviceId, dto);
    const size = await getPrivateObjectSize(objectKey);
    if (size === null) throw new BadRequestException('Screenshot has not been uploaded');
    if (size === 0 || size > MAX_SCREENSHOT_BYTES) {
      await deletePrivateObject(objectKey).catch(() => undefined);
      throw new BadRequestException('Screenshot size is invalid');
    }
    // No cleanup on a DB failure: the agent retries confirm and the key is deterministic.
    return this.storeScreenshotRow(device.employeeId, device.deviceId, dto, size, objectKey);
  }

  /** Issues a new device token (shown once) and revokes any previous ones for the employee's device. */
  async issueDeviceToken(employeeId: string) {
    const employee = await EmployeeModel.findByEmployeeId(employeeId);
    const deviceId = employee?.deviceId?.trim();
    if (!deviceId) throw new BadRequestException('Assign a device ID to this employee first');

    const token = `oxoa_${randomBytes(32).toString('hex')}`;
    await db.transaction(async (tx) => {
      await tx
        .update(agentDeviceTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(agentDeviceTokens.employeeId, employeeId), isNull(agentDeviceTokens.revokedAt)));
      await tx.insert(agentDeviceTokens).values({ employeeId, deviceId, tokenHash: hashDeviceToken(token) });
    });
    return { token, deviceId };
  }

  async revokeDeviceTokens(employeeId: string) {
    const revoked = await db
      .update(agentDeviceTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(agentDeviceTokens.employeeId, employeeId), isNull(agentDeviceTokens.revokedAt)))
      .returning({ id: agentDeviceTokens.id });
    return { revoked: revoked.length };
  }

  private screenshotObjectKey(deviceId: string, data: { eventId: number; mimeType: string }) {
    const ext = data.mimeType === 'image/png' ? 'png' : 'jpg';
    const safeDevice = deviceId.toLowerCase().replace(/[^a-z0-9-]/g, '_');
    return `agent-screenshots/${safeDevice}/${data.eventId}.${ext}`;
  }

  private storeScreenshotRow(
    employeeId: string,
    assignedDeviceId: string,
    data: Pick<ConfirmScreenshotUploadDto, 'eventId' | 'fileName' | 'capturedAt' | 'mimeType' | 'sha256'>,
    sizeBytes: number,
    objectKey: string,
  ) {
    return db.transaction(async (tx) => {
      // The agent also reports every screenshot as an ordinary `activity.log` event, and the
      // 5s log batch can land before this frame - so the log row may already exist. Reuse it
      // (adopting the file name) rather than treating the conflict as a replay, or the image
      // would be dropped and the row left without a picture.
      const [log] = await tx
        .insert(agentActivityLogs)
        .values({
          employeeId,
          deviceId: assignedDeviceId,
          agentLogId: data.eventId,
          eventType: 'screenshot',
          startTs: new Date(data.capturedAt),
          windowTitle: data.fileName.slice(0, 500),
        })
        .onConflictDoUpdate({
          target: [agentActivityLogs.deviceId, agentActivityLogs.agentLogId],
          set: { windowTitle: data.fileName.slice(0, 500) },
        })
        .returning({ id: agentActivityLogs.id });

      // Only a true replay (image already stored for this log) is a no-op.
      const inserted = await tx
        .insert(agentScreenshots)
        .values({
          activityLogId: log.id,
          mimeType: data.mimeType,
          sizeBytes,
          sha256: data.sha256 ?? null,
          objectKey,
        })
        .onConflictDoNothing({ target: agentScreenshots.activityLogId })
        .returning({ id: agentScreenshots.id });

      return inserted.length ? { stored: true, activityLogId: log.id } : { stored: false };
    });
  }

  async getScreenshot(id: number) {
    const [row] = await db
      .select({
        mimeType: agentScreenshots.mimeType,
        content: agentScreenshots.content,
        objectKey: agentScreenshots.objectKey,
      })
      .from(agentScreenshots)
      .where(eq(agentScreenshots.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Screenshot not found');
    if (row.objectKey) {
      return { mimeType: row.mimeType, content: await downloadPrivateObject(row.objectKey) };
    }
    if (!row.content) throw new NotFoundException('Screenshot not found');
    return { mimeType: row.mimeType, content: row.content };
  }

  async list(query: GetAgentLogsQueryDto) {
    const where = this.buildWhere(query);
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const [rows, totals] = await Promise.all([
      db
        .select({ log: agentActivityLogs, screenshotId: agentScreenshots.id, objectKey: agentScreenshots.objectKey })
        .from(agentActivityLogs)
        .leftJoin(agentScreenshots, eq(agentScreenshots.activityLogId, agentActivityLogs.id))
        .where(where)
        .orderBy(desc(agentActivityLogs.startTs), desc(agentActivityLogs.id))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(agentActivityLogs).where(where),
    ]);

    // Signed GCS URLs for screenshots stored in the bucket; null (legacy rows, or signing not
    // available) makes the UI fall back to the authenticated /screenshots/:id endpoint.
    const urls = await Promise.all(
      rows.map(async ({ objectKey }) => {
        if (!objectKey) return null;
        try {
          return await getPrivateObjectSignedUrl(objectKey);
        } catch (err) {
          logger.warn({ err }, 'Could not sign screenshot URL');
          return null;
        }
      }),
    );

    const employees = await EmployeeModel.findByEmployeeIds(rows.map((r) => r.log.employeeId));
    return {
      total: totals[0]?.total ?? 0,
      logs: rows.map(({ log, screenshotId, objectKey }, i) => ({
        ...log,
        screenshotId,
        screenshotUrl: urls[i],
        firstName: employees.get(log.employeeId)?.firstName ?? '',
        lastName: employees.get(log.employeeId)?.lastName ?? '',
      })),
    };
  }

  /** One row per employee that has reported logs: device, last activity, event totals. */
  async summarize(query: GetAgentLogsQueryDto) {
    const rows = await db
      .select({
        employeeId: agentActivityLogs.employeeId,
        deviceId: agentActivityLogs.deviceId,
        lastEventAt: max(agentActivityLogs.startTs),
        eventCount: count(),
        idleCount: sql<number>`count(*) filter (where ${agentActivityLogs.eventType} = 'idle_start')`.mapWith(Number),
        windowCount: sql<number>`count(*) filter (where ${agentActivityLogs.eventType} = 'window_focus')`.mapWith(Number),
      })
      .from(agentActivityLogs)
      .where(this.buildWhere(query))
      .groupBy(agentActivityLogs.employeeId, agentActivityLogs.deviceId)
      .orderBy(desc(max(agentActivityLogs.startTs)));

    const employees = await EmployeeModel.findByEmployeeIds(rows.map((r) => r.employeeId));
    return rows.map((row) => ({
      ...row,
      firstName: employees.get(row.employeeId)?.firstName ?? '',
      lastName: employees.get(row.employeeId)?.lastName ?? '',
    }));
  }

  private buildWhere(q: GetAgentLogsQueryDto): SQL | undefined {
    const conditions: SQL[] = [];
    if (q.employeeId) conditions.push(eq(agentActivityLogs.employeeId, q.employeeId));
    if (q.deviceId) conditions.push(eq(agentActivityLogs.deviceId, q.deviceId));
    if (q.eventType) conditions.push(eq(agentActivityLogs.eventType, normaliseEventType(q.eventType)));
    if (q.from) conditions.push(gte(agentActivityLogs.startTs, new Date(`${q.from}T00:00:00`)));
    if (q.to) {
      const toExclusive = new Date(`${q.to}T00:00:00`);
      toExclusive.setDate(toExclusive.getDate() + 1);
      conditions.push(lt(agentActivityLogs.startTs, toExclusive));
    }
    return conditions.length ? and(...conditions) : undefined;
  }
}
