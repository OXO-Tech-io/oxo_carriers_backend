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

  async listAll() {
    const list = await DocumentModel.listAll();
    return Promise.all(
      list.map(async (document) => {
        const [recipientRows, attachments] = await Promise.all([
          DocumentRecipientModel.listByDocumentId(document.id),
          AttachmentModel.findByEntity('document_vault', document.id),
        ]);
        return {
          ...document,
          recipientEmployeeIds: recipientRows.map((r) => r.employeeId),
          attachments,
        };
      }),
    );
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
