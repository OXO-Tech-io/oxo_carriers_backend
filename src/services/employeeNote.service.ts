import { EmployeeNoteModel } from '../models/EmployeeNote';
import { AttachmentModel, type AttachmentFileInput } from '../models/Attachment';

export const employeeNoteService = {
  async create(employeeId: string, authorUserId: number, content: string, files: AttachmentFileInput[]) {
    const note = await EmployeeNoteModel.create({ employeeId, authorUserId, content });
    if (files.length) {
      await AttachmentModel.createMany('employee_note', note.id, files, authorUserId);
    }
    return note;
  },

  async listForEmployee(employeeId: string) {
    const notes = await EmployeeNoteModel.listByEmployeeId(employeeId);
    const attachments = await AttachmentModel.findByEntityMany(
      'employee_note',
      notes.map((n) => n.id)
    );
    return notes.map((note) => ({
      ...note,
      attachments: attachments.filter((a) => a.entityId === note.id),
    }));
  },

  async getById(id: number) {
    const note = await EmployeeNoteModel.findById(id);
    if (!note) return null;
    const attachments = await AttachmentModel.findByEntity('employee_note', id);
    return { ...note, attachments };
  },

  async update(id: number, content: string) {
    return EmployeeNoteModel.update(id, content);
  },
};
