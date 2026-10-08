import { EmployeeNoteModel } from './EmployeeNote';
import { AttachmentModel, type AttachmentFileInput } from '../../common/models/Attachment';
import { EmployeeModel } from '../../employees/Employee';

// OCD-479: each note should surface who added it - resolved here (batched,
// not per-note) so the frontend never has to make a second round-trip just
// to show "Added By".
async function attachAuthorNames<T extends { authorUserId: number | null }>(
  notes: T[]
): Promise<(T & { authorName: string | null; authorRole: string | null })[]> {
  const authorIds = [...new Set(notes.map((n) => n.authorUserId).filter((id): id is number => id != null))];
  const authors = authorIds.length ? await EmployeeModel.findByIds(authorIds) : [];
  const authorMap = new Map(authors.map((a) => [a.id, a]));
  return notes.map((note) => {
    const author = note.authorUserId != null ? authorMap.get(note.authorUserId) : undefined;
    return {
      ...note,
      authorName: author ? `${author.firstName} ${author.lastName}`.trim() : null,
      // OCD-480: lets the frontend show/hide the Edit button per the same
      // "author or more senior role" rule the server enforces - see
      // NOTE_ROLE_RANK in employee-notes.service.ts.
      authorRole: author ? author.role : null,
    };
  });
}

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
    const withAuthors = await attachAuthorNames(notes);
    return withAuthors.map((note) => ({
      ...note,
      attachments: attachments.filter((a) => a.entityId === note.id),
    }));
  },

  async getById(id: number) {
    const note = await EmployeeNoteModel.findById(id);
    if (!note) return null;
    const attachments = await AttachmentModel.findByEntity('employee_note', id);
    const [withAuthor] = await attachAuthorNames([note]);
    return { ...withAuthor, attachments };
  },

  async update(id: number, content: string) {
    return EmployeeNoteModel.update(id, content);
  },
};
