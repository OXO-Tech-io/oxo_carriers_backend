import ExcelJS from 'exceljs';
import { CommunicationModel } from './Communication';
import { CommunicationRecipientModel } from './CommunicationRecipient';
import { AttachmentModel, type AttachmentFileInput } from '../../common/models/Attachment';
import { EmployeeModel } from '../../employees/Employee';
import { groupService } from '../groups/group.service';
import { NotFoundError, ForbiddenError } from '../../utils/AppError';
import { sendCommunicationEmail } from '../../config/email';
import { notificationService } from '../notifications/notification.service';
import { logger } from '../../lib/logger';

export const communicationService = {
  async create(
    title: string,
    body: string,
    recipientUserIds: number[],
    recipientGroupIds: number[],
    createdBy: number,
    files: AttachmentFileInput[]
  ) {
    const groupMemberIds = await groupService.resolveMemberUserIds(recipientGroupIds);
    const resolvedUserIds = [...new Set([...recipientUserIds, ...groupMemberIds])];

    const communication = await CommunicationModel.create({ title, body, createdBy });
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
    return CommunicationModel.listAll();
  },

  async listMine(employeeId: string) {
    return CommunicationRecipientModel.listForUser(employeeId);
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
      const leadTimeMs =
        row.emailSentAt && row.respondedAt ? new Date(row.respondedAt).getTime() - new Date(row.emailSentAt).getTime() : null;
      worksheet.addRow({
        title: row.title,
        recipient: `${row.recipientName} ${row.recipientLastName} (${row.recipientEmail})`,
        emailSentAt: row.emailSentAt ? new Date(row.emailSentAt).toLocaleString() : 'Not sent',
        respondedAt: row.respondedAt ? new Date(row.respondedAt).toLocaleString() : 'No response',
        leadTime: leadTimeMs !== null ? `${(leadTimeMs / (1000 * 60 * 60)).toFixed(2)} hours` : '-',
      });
    });

    return workbook.xlsx.writeBuffer();
  },
};
