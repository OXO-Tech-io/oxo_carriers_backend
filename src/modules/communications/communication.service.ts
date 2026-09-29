import ExcelJS from 'exceljs';
import { CommunicationModel } from './Communication';
import { CommunicationRecipientModel } from './CommunicationRecipient';
import { AttachmentModel, type AttachmentFileInput } from '../../common/models/Attachment';
import type { Attachment as DrizzleAttachment } from '../../db/schema';
import { EmployeeModel } from '../../employees/Employee';
import { groupService } from '../groups/group.service';
import { NotFoundError, ForbiddenError } from '../../utils/AppError';
import { sendCommunicationEmail } from '../../config/email';
import { notificationService } from '../notifications/notification.service';
import { logger } from '../../lib/logger';
import { formatExportTimestamp } from '../../utils/helpers';

const ENTITY_TYPE = 'communication';

// OCD-572: exported timestamps must show the same wall-clock time the app
// displays elsewhere, in DD/MM/YYYY order, rather than whatever locale/
// timezone the export process's own OS happens to default to (previously a
// bare `.toLocaleString()`, which renders as en-US M/D/YYYY on a typical
// server). Shares the EXPORT_TIMEZONE/'en-GB' convention already used for
// Forms' Excel exports (see utils/helpers.ts) so every HR export agrees on
// one format.

export type CommunicationAttachmentSummary = {
  fileUrl: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
};

const toAttachmentSummary = (attachment: DrizzleAttachment): CommunicationAttachmentSummary => ({
  fileUrl: attachment.fileUrl,
  fileName: attachment.fileName,
  mimeType: attachment.mimeType,
  fileSize: attachment.fileSize,
});

/** Groups a flat attachment list (as returned by AttachmentModel.findByEntityMany) by entityId,
 * so each communication can be given only its own attachments. */
const groupAttachmentsByEntityId = (attachments: DrizzleAttachment[]): Map<number, DrizzleAttachment[]> => {
  const byEntityId = new Map<number, DrizzleAttachment[]>();
  for (const attachment of attachments) {
    const bucket = byEntityId.get(attachment.entityId);
    if (bucket) bucket.push(attachment);
    else byEntityId.set(attachment.entityId, [attachment]);
  }
  return byEntityId;
};

export const communicationService = {
  async create(
    title: string,
    body: string,
    recipientUserIds: number[],
    recipientGroupIds: number[],
    createdBy: number,
    files: AttachmentFileInput[],
    requiresAcknowledgement = false,
    deadlineAt: Date | null = null
  ) {
    const groupMemberIds = await groupService.resolveMemberUserIds(recipientGroupIds);
    const resolvedUserIds = [...new Set([...recipientUserIds, ...groupMemberIds])];

    const communication = await CommunicationModel.create({ title, body, createdBy, requiresAcknowledgement, deadlineAt });
    const recipientEmployees = await EmployeeModel.findByIds(resolvedUserIds);
    const recipientEmployeeIds = recipientEmployees
      .map((employee) => employee.employeeId)
      .filter((id): id is string => !!id);
    const recipients = await CommunicationRecipientModel.createMany(communication.id, recipientEmployeeIds);
    if (files.length) {
      await AttachmentModel.createMany('communication', communication.id, files, createdBy);
    }

    // Fire-and-forget email + in-app notification per recipient - never blocks
    // or fails the create request if SMTP has a hiccup.
    for (const recipient of recipients) {
      (async () => {
        try {
          const user = await EmployeeModel.findByEmployeeId(recipient.employeeId);
          if (user?.email) {
            await sendCommunicationEmail(user.email, {
              employeeName: `${user.firstName} ${user.lastName}`,
              title,
              bodyHtml: body,
            });
            await CommunicationRecipientModel.markEmailSent(recipient.id);
          }
          await notificationService.notify(
            recipient.employeeId,
            'communication',
            title,
            'You have a new communication from HR.',
            { communicationId: communication.id },
            '/my-communications'
          );
        } catch (err) {
          logger.error({ err, recipientId: recipient.id }, 'Failed to deliver communication to recipient');
        }
      })();
    }

    return communication;
  },

  async listAll() {
    const list = await CommunicationModel.listAll();
    // OCD-525: attachments were created on `create` (above) but never read back
    // here, so they never made it into the API response. Batch-fetched once
    // for the whole list (rather than per-communication) and grouped by
    // entityId below.
    const attachments = await AttachmentModel.findByEntityMany(ENTITY_TYPE, list.map((c) => c.id));
    const attachmentsByCommunicationId = groupAttachmentsByEntityId(attachments);
    return Promise.all(
      list.map(async (communication) => {
        const recipientRows = await CommunicationRecipientModel.listByCommunicationId(communication.id);
        const employeeMap = await EmployeeModel.findByEmployeeIds(recipientRows.map((r) => r.employeeId));
        const deadline = communication.deadlineAt ? new Date(communication.deadlineAt) : null;

        const recipients = recipientRows.map((r) => {
          const emp = employeeMap.get(r.employeeId);
          const isAcknowledged = !!r.respondedAt;
          const isLate = isAcknowledged && !!deadline && new Date(r.respondedAt!) > deadline;
          const isOnTime = isAcknowledged && !isLate;
          return {
            id: r.id,
            userId: emp?.id ?? 0,
            name: emp ? `${emp.firstName} ${emp.lastName}` : r.employeeId,
            email: emp?.email ?? '',
            emailSentAt: r.emailSentAt,
            respondedAt: r.respondedAt,
            responseText: r.responseText,
            isAcknowledged,
            isOnTime,
            isLate,
          };
        });

        const totalRecipients = recipients.length;
        const acknowledgedCount = recipients.filter((r) => r.isAcknowledged).length;
        const onTimeCount = recipients.filter((r) => r.isOnTime).length;
        const lateCount = recipients.filter((r) => r.isLate).length;
        const pendingCount = totalRecipients - acknowledgedCount;

        return {
          ...communication,
          totalRecipients,
          acknowledgedCount,
          onTimeCount,
          lateCount,
          pendingCount,
          recipients,
          attachments: (attachmentsByCommunicationId.get(communication.id) ?? []).map(toAttachmentSummary),
        };
      }),
    );
  },

  async listMine(employeeId: string) {
    const rows = await CommunicationRecipientModel.listForUser(employeeId);
    // OCD-525: same fix as listAll above, keyed by each row's communicationId
    // (the recipient row's own `id` is unrelated - it's tbl_communication_recipients.id).
    const attachments = await AttachmentModel.findByEntityMany(ENTITY_TYPE, rows.map((r) => r.communicationId));
    const attachmentsByCommunicationId = groupAttachmentsByEntityId(attachments);
    return rows.map((row) => ({
      ...row,
      attachments: (attachmentsByCommunicationId.get(row.communicationId) ?? []).map(toAttachmentSummary),
    }));
  },

  async delete(communicationId: number) {
    const communication = await CommunicationModel.findById(communicationId);
    if (!communication) throw new NotFoundError('Communication not found');
    await AttachmentModel.deleteByEntity('communication', communicationId);
    await CommunicationModel.deleteById(communicationId);
  },

  async respond(communicationId: number, employeeId: string, responseText?: string) {
    const recipient = await CommunicationRecipientModel.findByCommunicationAndUser(communicationId, employeeId);
    if (!recipient) throw new NotFoundError('Communication not found for this user');
    if (recipient.respondedAt) throw new ForbiddenError('You have already responded to this communication');
    await CommunicationRecipientModel.markResponded(recipient.id, responseText);
  },

  async generateReport(communicationId?: number): Promise<ExcelJS.Buffer> {
    const rows = await CommunicationRecipientModel.getReportRows(communicationId);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Communications Report');
    worksheet.columns = [
      { header: 'Title', key: 'title', width: 35 },
      { header: 'Recipient', key: 'recipient', width: 30 },
      { header: 'Email Sent At', key: 'emailSentAt', width: 22 },
      { header: 'Responded At', key: 'respondedAt', width: 22 },
      { header: 'Response Lead Time', key: 'leadTime', width: 22 },
    ];
    worksheet.getRow(1).font = { bold: true };

    rows.forEach((row) => {
      // Computed from the raw sent/responded Date values (epoch-based, timezone-agnostic) -
      // not from the formatted display strings below - so this was never affected by the
      // formatting bug, but is kept alongside the corrected timestamps it's derived from.
      const leadTimeMs =
        row.emailSentAt && row.respondedAt ? new Date(row.respondedAt).getTime() - new Date(row.emailSentAt).getTime() : null;
      worksheet.addRow({
        title: row.title,
        recipient: `${row.recipientName} ${row.recipientLastName} (${row.recipientEmail})`,
        emailSentAt: row.emailSentAt ? formatExportTimestamp(row.emailSentAt) : 'Not sent',
        respondedAt: row.respondedAt ? formatExportTimestamp(row.respondedAt) : 'No response',
        leadTime: leadTimeMs !== null ? `${(leadTimeMs / (1000 * 60 * 60)).toFixed(2)} hours` : '-',
      });
    });

    return workbook.xlsx.writeBuffer();
  },
};
