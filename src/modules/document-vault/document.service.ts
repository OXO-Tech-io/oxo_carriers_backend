import { DocumentModel, type DocumentTargetType } from './Document';
import { DocumentRecipientModel } from './DocumentRecipient';
import { AttachmentModel, type AttachmentFileInput } from '../../common/models/Attachment';
import { EmployeeModel } from '../../employees/Employee';
import { BadRequestError, NotFoundError } from '../../utils/AppError';

export const documentService = {
  async create(
    title: string,
    description: string | null,
    targetType: DocumentTargetType,
    individualEmployeeIds: number[],
    createdBy: number,
    files: AttachmentFileInput[],
  ) {
    if (targetType === 'individual' && individualEmployeeIds.length === 0) {
      throw new BadRequestError('At least one employee is required when targeting specific employees');
    }

    const document = await DocumentModel.create({ title, description, targetType, createdBy });

    if (targetType === 'individual') {
      const recipientEmployees = await EmployeeModel.findByIds(individualEmployeeIds);
      const recipientEmployeeIds = [
        ...new Set(recipientEmployees.map((employee) => employee.employeeId).filter((id): id is string => !!id)),
      ];
      await DocumentRecipientModel.createMany(document.id, recipientEmployeeIds);
    }

    if (files.length) {
      await AttachmentModel.createMany('document_vault', document.id, files, createdBy);
    }

    return document;
  },

  async listAll(page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;
    const [list, total] = await Promise.all([
      DocumentModel.listAll(pageSize, offset),
      DocumentModel.countAll(),
    ]);

    const documentIds = list.map((document) => document.id);
    const [recipientRows, attachments] = await Promise.all([
      DocumentRecipientModel.listByDocumentIds(documentIds),
      AttachmentModel.findByEntityMany('document_vault', documentIds),
    ]);

    const items = list.map((document) => ({
      ...document,
      recipientEmployeeIds: recipientRows.filter((r) => r.documentId === document.id).map((r) => r.employeeId),
      attachments: attachments.filter((a) => a.entityId === document.id),
    }));

    return { items, total, page, pageSize };
  },

  async listForEmployee(employeeId: string) {
    const list = await DocumentRecipientModel.listForEmployee(employeeId);
    const attachments = await AttachmentModel.findByEntityMany(
      'document_vault',
      list.map((d) => d.id),
    );
    return list.map((document) => ({
      ...document,
      attachments: attachments.filter((a) => a.entityId === document.id),
    }));
  },

  // For the admin per-employee view (Document Vault modal on the Users
  // page) - internalId is tbl_employee.id, resolved to the business
  // employeeId before reusing the same merged query the employee sees on
  // their own profile/My Documents page.
  async listForEmployeeByInternalId(internalId: number) {
    const employee = await EmployeeModel.findById(internalId);
    if (!employee?.employeeId) {
      throw new BadRequestError('This user has no employee ID assigned yet');
    }
    return this.listForEmployee(employee.employeeId);
  },

  async delete(documentId: number) {
    const document = await DocumentModel.findById(documentId);
    if (!document) throw new NotFoundError('Document not found');
    await AttachmentModel.deleteByEntity('document_vault', documentId);
    await DocumentModel.deleteById(documentId);
  },
};
