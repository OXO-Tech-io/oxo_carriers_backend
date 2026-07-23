import ExcelJS from 'exceljs';
import { FormModel, type FormFieldInput } from '../models/Form';
import { FormDistributionModel } from '../models/FormDistribution';
import { FormResponseModel } from '../models/FormResponse';
import { AttachmentModel, type AttachmentFileInput } from '../models/Attachment';
import { EmployeeModel } from '../models/Employee';
import { groupService } from './group.service';
import { notificationService } from './notification.service';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/AppError';
import { CreateFormInput } from '../validators/form.validator';

export const formService = {
  async create(input: CreateFormInput, createdBy: number) {
    const fields: FormFieldInput[] = input.fields.map((f) => ({
      label: f.label,
      fieldType: f.fieldType,
      options: f.options ?? null,
      required: f.required,
      orderIndex: f.orderIndex,
    }));
    return FormModel.createWithFields({ title: input.title, description: input.description ?? null, createdBy }, fields);
  },

  async list() {
    return FormModel.listAll();
  },

  async publish(formId: number) {
    const form = await FormModel.publish(formId);
    if (!form) throw new NotFoundError('Form not found');
    return form;
  },

  async distribute(formId: number, userIds: number[], groupIds: number[] = []) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    const groupMemberIds = await groupService.resolveMemberUserIds(groupIds);
    const resolvedUserIds = [...new Set([...userIds, ...groupMemberIds])];
    const distributions = await FormDistributionModel.createMany(formId, resolvedUserIds);
    await notificationService.notifyMany(
      resolvedUserIds,
      'form',
      `New form: ${form.title}`,
      'HR has assigned you a form to fill out.',
      { formId },
      '/my-forms'
    );
    return distributions;
  },

  async getFormWithFields(formId: number) {
    const form = await FormModel.findById(formId);
    if (!form) throw new NotFoundError('Form not found');
    const fields = await FormModel.listFieldsByFormId(formId);
    return { form, fields };
  },

  async listAssignedToMe(userId: number) {
    const distributions = await FormDistributionModel.listByUserId(userId);
    const results = await Promise.all(
      distributions.map(async (dist) => {
        const form = await FormModel.findById(dist.formId);
        const response = await FormResponseModel.findByFormAndUser(dist.formId, userId);
        return { form, distributedAt: dist.distributedAt, submitted: !!response };
      })
    );
    return results.filter((r) => r.form);
  },

  async submitResponse(
    formId: number,
    userId: number,
    textAnswers: { fieldId: number; value?: string }[],
    files: AttachmentFileInput[]
  ) {
    const isDistributed = await FormDistributionModel.isDistributedTo(formId, userId);
    if (!isDistributed) throw new ForbiddenError('This form was not assigned to you');

    const existing = await FormResponseModel.findByFormAndUser(formId, userId);
    if (existing) throw new BadRequestError('You have already submitted a response for this form');

    const fields = await FormModel.listFieldsByFormId(formId);
    const fieldById = new Map(fields.map((f) => [f.id, f]));
    const fileFieldIdsWithFile = new Set(
      files
        .map((f) => Number(f.fieldname.replace('field_', '')))
        .filter((id) => !Number.isNaN(id))
    );

    for (const field of fields) {
      if (!field.required) continue;
      if (field.fieldType === 'file') {
        if (!fileFieldIdsWithFile.has(field.id)) throw new BadRequestError(`"${field.label}" is required`);
      } else {
        const answer = textAnswers.find((a) => a.fieldId === field.id);
        if (!answer?.value) throw new BadRequestError(`"${field.label}" is required`);
      }
    }

    for (const answer of textAnswers) {
      const field = fieldById.get(answer.fieldId);
      if (!field) continue;
      if ((field.fieldType === 'radio' || field.fieldType === 'select') && answer.value) {
        const options = (field.options as string[] | null) ?? [];
        if (!options.includes(answer.value)) {
          throw new BadRequestError(`Invalid value for "${field.label}"`);
        }
      }
    }

    const response = await FormResponseModel.create(
      formId,
      userId,
      textAnswers
        .filter((a) => fieldById.get(a.fieldId)?.fieldType !== 'file')
        .map((a) => ({ fieldId: a.fieldId, valueText: a.value ?? null }))
    );

    for (const file of files) {
      const fieldId = Number(file.fieldname.replace('field_', ''));
      if (Number.isNaN(fieldId) || !fieldById.has(fieldId)) continue;
      const answer = await FormResponseModel.addFileAnswer(response.id, fieldId);
      await AttachmentModel.create('form_response_answer', answer.id, file, userId);
    }

    return response;
  },

  async listResponses(formId: number) {
    const responses = await FormResponseModel.listByFormId(formId);
    return Promise.all(
      responses.map(async (response) => {
        const answers = await FormResponseModel.listAnswersByResponseId(response.id);
        const user = await EmployeeModel.findById(response.userId);
        return { response, answers, user };
      })
    );
  },

  async exportResponsesToExcel(formId: number): Promise<ExcelJS.Buffer> {
    const { form, fields } = await this.getFormWithFields(formId);
    const responses = await this.listResponses(formId);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(form.title.slice(0, 31) || 'Responses');
    worksheet.columns = [
      { header: 'Submitted By', key: 'submittedBy', width: 30 },
      { header: 'Submitted At', key: 'submittedAt', width: 22 },
      ...fields.map((f) => ({ header: f.label, key: `field_${f.id}`, width: 30 })),
    ];
    worksheet.getRow(1).font = { bold: true };

    for (const { response, answers, user } of responses) {
      const row: Record<string, string> = {
        submittedBy: user ? `${user.firstName} ${user.lastName}` : `User #${response.userId}`,
        submittedAt: response.submittedAt ? new Date(response.submittedAt).toLocaleString() : '',
      };
      for (const field of fields) {
        const answer = answers.find((a) => a.fieldId === field.id);
        if (field.fieldType === 'file') {
          const attachments = answer ? await AttachmentModel.findByEntity('form_response_answer', answer.id) : [];
          row[`field_${field.id}`] = attachments.map((a) => a.fileName).join(', ');
        } else {
          row[`field_${field.id}`] = answer?.valueText ?? '';
        }
      }
      worksheet.addRow(row);
    }

    return workbook.xlsx.writeBuffer();
  },
};
