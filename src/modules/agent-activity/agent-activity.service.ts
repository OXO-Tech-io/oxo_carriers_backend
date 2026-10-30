import { ForbiddenException, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, lt, max, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import { agentActivityLogs } from '../../db/schema';
import { EmployeeModel } from '../../employees/Employee';
import { AgentLogDto } from './dto/ingest-agent-logs.dto';
import { GetAgentLogsQueryDto } from './dto/get-agent-logs-query.dto';

// The agent emits "Heartbeat" but lowercase everywhere else - normalise so filters
// and the UI don't have to care.
const normaliseEventType = (type: string) => type.trim().toLowerCase();

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

  async list(query: GetAgentLogsQueryDto) {
    const where = this.buildWhere(query);
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const [rows, totals] = await Promise.all([
      db
        .select()
        .from(agentActivityLogs)
        .where(where)
        .orderBy(desc(agentActivityLogs.startTs), desc(agentActivityLogs.id))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(agentActivityLogs).where(where),
    ]);

    const employees = await EmployeeModel.findByEmployeeIds(rows.map((r) => r.employeeId));
    return {
      total: totals[0]?.total ?? 0,
      logs: rows.map((row) => ({
        ...row,
        firstName: employees.get(row.employeeId)?.firstName ?? '',
        lastName: employees.get(row.employeeId)?.lastName ?? '',
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
