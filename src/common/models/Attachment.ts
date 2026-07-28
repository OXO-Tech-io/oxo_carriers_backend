import { db } from '../../db';
import { attachments, type Attachment as DrizzleAttachment } from '../../db/schema';
import { and, eq } from 'drizzle-orm';

export type AttachmentFileInput = Express.Multer.File;

const toFileUrl = (file: AttachmentFileInput): string => {
  const isDocument = ['document', 'supportive_document', 'relevant_document', 'log_sheet', 'invoice'].includes(
    file.fieldname ?? ''
  );
  return `/uploads/${isDocument ? 'documents' : 'others'}/${file.filename}`;
};

export class AttachmentModel {
  static async create(
    entityType: string,
    entityId: number,
    file: AttachmentFileInput,
    uploadedBy?: number | null
  ): Promise<DrizzleAttachment> {
    const [inserted] = await db
      .insert(attachments)
      .values({
        entityType,
        entityId,
        fileUrl: toFileUrl(file),
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        uploadedBy: uploadedBy ?? null,
      })
      .returning();
    if (!inserted) throw new Error('Failed to create attachment');
    return inserted;
  }

  static async createMany(
    entityType: string,
    entityId: number,
    files: AttachmentFileInput[],
    uploadedBy?: number | null
  ): Promise<DrizzleAttachment[]> {
    if (!files.length) return [];
    return Promise.all(files.map((file) => this.create(entityType, entityId, file, uploadedBy)));
  }

  static async findByEntity(entityType: string, entityId: number): Promise<DrizzleAttachment[]> {
    return db.query.attachments.findMany({
      where: and(eq(attachments.entityType, entityType), eq(attachments.entityId, entityId)),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
  }

  static async findByEntityMany(entityType: string, entityIds: number[]): Promise<DrizzleAttachment[]> {
    if (!entityIds.length) return [];
    const all = await db.query.attachments.findMany({
      where: eq(attachments.entityType, entityType),
    });
    const idSet = new Set(entityIds);
    return all.filter((a) => idSet.has(a.entityId));
  }

  static async deleteById(id: number): Promise<void> {
    await db.delete(attachments).where(eq(attachments.id, id));
  }

  static async deleteByEntity(entityType: string, entityId: number): Promise<void> {
    await db.delete(attachments).where(and(eq(attachments.entityType, entityType), eq(attachments.entityId, entityId)));
  }
}
