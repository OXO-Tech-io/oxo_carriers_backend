import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { and, count, desc, eq, gte, isNull, lt, max, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import { employeeActivityLogs, employeeDeviceTokens, employeeScreenshots } from '../../db/schema';
import { EmployeeModel } from '../../employees/Employee';
import { EmployeeActivityLogDto } from './dto/ingest-employee-activity-logs.dto';
import { GetEmployeeActivityLogsQueryDto } from './dto/get-employee-activity-logs-query.dto';
import { ConfirmScreenshotUploadDto, RequestScreenshotUploadDto } from './dto/employee-screenshot-upload.dto';
import { MAX_SCREENSHOT_BYTES } from './employee-activity.constants';
import { EmployeeDeviceIdentity, hashDeviceToken } from './guards/employee-device.guard';
import {
  deletePrivateObject,
  downloadPrivateObject,
  getPrivateObjectSignedUrl,
  getPrivateObjectSize,
  getPrivateObjectUploadUrl,
  isSecureBucketConfigured,
  storageErrorHint,
  uploadPrivateObject,
} from '../../lib/storage/gcsStorage';
import { logger } from '../../lib/logger';
import { env } from '../../config/env';

// The agent emits "Heartbeat" but lowercase everywhere else - normalise so filters
// and the UI don't have to care.
const normaliseEventType = (type: string) => type.trim().toLowerCase();

export { MAX_SCREENSHOT_BYTES };

// The tab pings every 15s while its socket to the agent is open; 3 missed pings = not connected.
const PRESENCE_TTL_MS = 45_000;

@Injectable()
export class EmployeeActivityService {
  /**
   * Stores a batch the employee's browser relayed from their local agent. A log only
   * counts if its deviceId is the one HR assigned to this employee, so one employee
   * cannot submit rows under another's device. Replays (same device + agent id) are
   * ignored, which makes browser reconnects and multiple open tabs harmless.
   */
  async ingest(employeeId: string, logs: EmployeeActivityLogDto[]) {
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
      .insert(employeeActivityLogs)
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
      .onConflictDoNothing({ target: [employeeActivityLogs.deviceId, employeeActivityLogs.agentLogId] })
      .returning({ id: employeeActivityLogs.id });

    return { received: logs.length, stored: inserted.length, rejected: logs.length - accepted.length };
  }

  /**
   * Agent upload step 1: hands the device a short-lived signed PUT URL for a deterministic
   * object key. Requires the bucket - without it there is nowhere for the agent to PUT.
   */
  async requestScreenshotUpload(device: EmployeeDeviceIdentity, dto: RequestScreenshotUploadDto) {
    if (!isSecureBucketConfigured()) throw new ServiceUnavailableException('Screenshot storage is not configured');
    const objectKey = this.screenshotObjectKey(device.deviceId, dto);
    let uploadUrl: string;
    try {
      uploadUrl = await getPrivateObjectUploadUrl(objectKey, dto.mimeType);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { err, employeeId: device.employeeId, objectKey, hint: storageErrorHint(message) },
        'Could not sign screenshot upload URL - run GET /employee-activities/storage-health',
      );
      throw new ServiceUnavailableException('Could not create a screenshot upload URL');
    }
    logger.info({ employeeId: device.employeeId, eventId: dto.eventId, objectKey }, 'Screenshot upload URL issued');
    // `method` + `headers` mirror the CGP presign response so clients send exactly what was signed.
    // `requiredHeaders` is kept for agents built before that shape.
    const headers = { 'Content-Type': dto.mimeType };
    return { uploadUrl, objectKey, method: 'PUT' as const, headers, requiredHeaders: headers, expiresInSeconds: 600 };
  }

  /** Agent upload step 3: verifies the object really landed (and is within the cap) before writing the row. */
  async confirmScreenshotUpload(device: EmployeeDeviceIdentity, dto: ConfirmScreenshotUploadDto) {
    const objectKey = this.screenshotObjectKey(device.deviceId, dto);
    const size = await getPrivateObjectSize(objectKey);
    if (size === null) throw new BadRequestException('Screenshot has not been uploaded');
    if (size === 0 || size > MAX_SCREENSHOT_BYTES) {
      await deletePrivateObject(objectKey).catch(() => undefined);
      throw new BadRequestException('Screenshot size is invalid');
    }
    // No cleanup on a DB failure: the agent retries confirm and the key is deterministic.
    const result = await this.storeScreenshotRow(device.employeeId, device.deviceId, dto, size, objectKey);
    logger.info(
      { employeeId: device.employeeId, eventId: dto.eventId, objectKey, sizeBytes: size, stored: result.stored },
      'Screenshot upload confirmed',
    );
    return result;
  }

  /**
   * Screenshot relayed by the employee's own HRIS tab (the agent hands it over the local
   * socket first and only uploads directly if no tab takes it). The device is the one HR
   * assigned to the signed-in employee, so the object key matches the direct-upload path
   * and a repeat from either route is a harmless replay.
   */
  async uploadRelayedScreenshot(
    employeeId: string,
    fields: { eventId: number; deviceId: string; mimeType: string; fileName: string; capturedAt: string },
    content: Buffer,
  ) {
    if (!isSecureBucketConfigured()) throw new ServiceUnavailableException('Screenshot storage is not configured');
    if (content.length === 0 || content.length > MAX_SCREENSHOT_BYTES) {
      throw new BadRequestException('Screenshot size is invalid');
    }
    const employee = await EmployeeModel.findByEmployeeId(employeeId);
    const deviceId = employee?.deviceId?.trim();
    if (!deviceId) throw new BadRequestException('No device ID is assigned to your account yet');

    // Any tab connected to the local agent relays its frames, so the image must come from
    // this employee's own device - the same rule the activity-log relay applies.
    if (fields.deviceId.toLowerCase() !== deviceId.toLowerCase()) {
      throw new ForbiddenException('This screenshot is from a different device');
    }

    const objectKey = this.screenshotObjectKey(deviceId, fields);
    const sha256 = createHash('sha256').update(content).digest('hex');
    let storedKey: string | null = objectKey;
    try {
      await uploadPrivateObject(objectKey, content, fields.mimeType);
    } catch (error) {
      // Local development often has no GCS credentials: keep the image in the database
      // instead (getScreenshot already serves rows without an object key). Never in production.
      if (env.IS_PRODUCTION) throw error;
      logger.warn({ err: error, eventId: fields.eventId }, 'GCS upload failed; storing screenshot in the database (non-production)');
      storedKey = null;
    }
    const result = await this.storeScreenshotRow(
      employeeId,
      deviceId,
      { ...fields, sha256 },
      content.length,
      storedKey,
      storedKey ? undefined : content,
    );
    logger.info(
      { employeeId, eventId: fields.eventId, objectKey, sizeBytes: content.length, stored: result.stored },
      'Relayed screenshot stored',
    );
    return result;
  }

  /** Issues a new device token (shown once) and revokes any previous ones for the employee's device. */
  async issueDeviceToken(employeeId: string) {
    const employee = await EmployeeModel.findByEmployeeId(employeeId);
    const deviceId = employee?.deviceId?.trim();
    if (!deviceId) throw new BadRequestException('Assign a device ID to this employee first');

    const token = `oxoa_${randomBytes(32).toString('hex')}`;
    await db.transaction(async (tx) => {
      await tx
        .update(employeeDeviceTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(employeeDeviceTokens.employeeId, employeeId), isNull(employeeDeviceTokens.revokedAt)));
      await tx.insert(employeeDeviceTokens).values({ employeeId, deviceId, tokenHash: hashDeviceToken(token) });
    });
    return { token, deviceId };
  }

  /** The employee may only mint a token for the device HR assigned to them (same rule as the log/screenshot relay). */
  async issueOwnDeviceToken(employeeId: string, deviceId: string) {
    const employee = await EmployeeModel.findByEmployeeId(employeeId);
    const assigned = employee?.deviceId?.trim();
    if (!assigned) throw new BadRequestException('No device ID is assigned to your account yet');
    if (assigned.toLowerCase() !== deviceId.trim().toLowerCase()) {
      throw new ForbiddenException('This device is not assigned to you');
    }
    return this.issueDeviceToken(employeeId);
  }

  /**
   * Presence of the employee's agent socket, reported by their own HRIS tab. Kept in memory:
   * it is a liveness signal that heals itself within PRESENCE_TTL_MS, so it is not worth a table.
   * (With several API instances each only knows its own tabs; move to the DB/Redis then.)
   */
  private readonly presence = new Map<string, { deviceId: string; seenAt: number }>();

  async recordPresence(employeeId: string, deviceId: string, connected: boolean) {
    const employee = await EmployeeModel.findByEmployeeId(employeeId);
    const assigned = employee?.deviceId?.trim();
    if (!assigned) throw new ForbiddenException('No device ID is assigned to your account');
    if (assigned.toLowerCase() !== deviceId.trim().toLowerCase()) {
      throw new ForbiddenException('This device is not assigned to you');
    }
    if (connected) this.presence.set(employeeId, { deviceId: assigned, seenAt: Date.now() });
    else this.presence.delete(employeeId);
    return { connected };
  }

  /** Every employee with a live agent socket right now (seen within PRESENCE_TTL_MS). */
  listPresence() {
    const now = Date.now();
    const rows: { employeeId: string; deviceId: string; lastSeenAt: string }[] = [];
    for (const [employeeId, p] of this.presence) {
      if (now - p.seenAt > PRESENCE_TTL_MS) {
        this.presence.delete(employeeId);
        continue;
      }
      rows.push({ employeeId, deviceId: p.deviceId, lastSeenAt: new Date(p.seenAt).toISOString() });
    }
    return rows;
  }

  async revokeDeviceTokens(employeeId: string) {
    const revoked = await db
      .update(employeeDeviceTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(employeeDeviceTokens.employeeId, employeeId), isNull(employeeDeviceTokens.revokedAt)))
      .returning({ id: employeeDeviceTokens.id });
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
    objectKey: string | null,
    inlineContent?: Buffer,
  ) {
    return db.transaction(async (tx) => {
      // The agent also reports every screenshot as an ordinary `activity.log` event, and the
      // 5s log batch can land before this frame - so the log row may already exist. Reuse it
      // (adopting the file name) rather than treating the conflict as a replay, or the image
      // would be dropped and the row left without a picture.
      const [log] = await tx
        .insert(employeeActivityLogs)
        .values({
          employeeId,
          deviceId: assignedDeviceId,
          agentLogId: data.eventId,
          eventType: 'screenshot',
          startTs: new Date(data.capturedAt),
          windowTitle: data.fileName.slice(0, 500),
        })
        .onConflictDoUpdate({
          target: [employeeActivityLogs.deviceId, employeeActivityLogs.agentLogId],
          set: { windowTitle: data.fileName.slice(0, 500) },
        })
        .returning({ id: employeeActivityLogs.id });

      // Only a true replay (image already stored for this log) is a no-op.
      const inserted = await tx
        .insert(employeeScreenshots)
        .values({
          activityLogId: log.id,
          mimeType: data.mimeType,
          sizeBytes,
          sha256: data.sha256 ?? null,
          objectKey,
          content: inlineContent ?? null,
        })
        .onConflictDoNothing({ target: employeeScreenshots.activityLogId })
        .returning({ id: employeeScreenshots.id });

      return inserted.length ? { stored: true, activityLogId: log.id } : { stored: false };
    });
  }

  async getScreenshot(id: number) {
    const [row] = await db
      .select({
        mimeType: employeeScreenshots.mimeType,
        content: employeeScreenshots.content,
        objectKey: employeeScreenshots.objectKey,
      })
      .from(employeeScreenshots)
      .where(eq(employeeScreenshots.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Screenshot not found');
    if (row.objectKey) {
      return { mimeType: row.mimeType, content: await downloadPrivateObject(row.objectKey) };
    }
    if (!row.content) throw new NotFoundException('Screenshot not found');
    return { mimeType: row.mimeType, content: row.content };
  }

  async list(query: GetEmployeeActivityLogsQueryDto) {
    const where = this.buildWhere(query);
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const [rows, totals] = await Promise.all([
      db
        .select({ log: employeeActivityLogs, screenshotId: employeeScreenshots.id, objectKey: employeeScreenshots.objectKey })
        .from(employeeActivityLogs)
        .leftJoin(employeeScreenshots, eq(employeeScreenshots.activityLogId, employeeActivityLogs.id))
        .where(where)
        .orderBy(desc(employeeActivityLogs.startTs), desc(employeeActivityLogs.id))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(employeeActivityLogs).where(where),
    ]);

    // Signed GCS URLs for screenshots stored in the bucket; null (legacy rows, or signing not
    // available) makes the UI fall back to the authenticated /screenshots/:id endpoint.
    const urls = await Promise.all(
      rows.map(async ({ objectKey }) => {
        if (!objectKey) return null;
        try {
          return await getPrivateObjectSignedUrl(objectKey);
        } catch (err) {
          logger.warn(
            { err, objectKey, hint: storageErrorHint(err instanceof Error ? err.message : String(err)) },
            'Could not sign screenshot URL; the UI will fall back to the authenticated image endpoint',
          );
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
  async summarize(query: GetEmployeeActivityLogsQueryDto) {
    const rows = await db
      .select({
        employeeId: employeeActivityLogs.employeeId,
        deviceId: employeeActivityLogs.deviceId,
        lastEventAt: max(employeeActivityLogs.startTs),
        eventCount: count(),
        idleCount: sql<number>`count(*) filter (where ${employeeActivityLogs.eventType} = 'idle_start')`.mapWith(Number),
        windowCount: sql<number>`count(*) filter (where ${employeeActivityLogs.eventType} = 'window_focus')`.mapWith(Number),
      })
      .from(employeeActivityLogs)
      .where(this.buildWhere(query))
      .groupBy(employeeActivityLogs.employeeId, employeeActivityLogs.deviceId)
      .orderBy(desc(max(employeeActivityLogs.startTs)));

    const employees = await EmployeeModel.findByEmployeeIds(rows.map((r) => r.employeeId));
    return rows.map((row) => ({
      ...row,
      firstName: employees.get(row.employeeId)?.firstName ?? '',
      lastName: employees.get(row.employeeId)?.lastName ?? '',
    }));
  }

  private buildWhere(q: GetEmployeeActivityLogsQueryDto): SQL | undefined {
    const conditions: SQL[] = [];
    if (q.employeeId) conditions.push(eq(employeeActivityLogs.employeeId, q.employeeId));
    if (q.deviceId) conditions.push(eq(employeeActivityLogs.deviceId, q.deviceId));
    if (q.eventType) conditions.push(eq(employeeActivityLogs.eventType, normaliseEventType(q.eventType)));
    if (q.from) conditions.push(gte(employeeActivityLogs.startTs, new Date(`${q.from}T00:00:00`)));
    if (q.to) {
      const toExclusive = new Date(`${q.to}T00:00:00`);
      toExclusive.setDate(toExclusive.getDate() + 1);
      conditions.push(lt(employeeActivityLogs.startTs, toExclusive));
    }
    return conditions.length ? and(...conditions) : undefined;
  }
}
