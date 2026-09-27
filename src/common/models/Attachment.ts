import { db } from '../../db';
import { attachments, type Attachment as DrizzleAttachment } from '../../db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { FileBlobModel } from './FileBlob';
import { logger } from '../../lib/logger';

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
    await FileBlobModel.persist(file).catch((err: unknown) =>
      logger.error({ err, filename: file.filename }, 'Failed to persist attachment file to the database')
    );
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

  /** Copies an existing attachment's metadata onto a new entity (same stored file, new DB row) -
   * used when a re-submitted form response carries a file question's attachment forward onto its
   * new answer row without requiring the file to be re-uploaded. */
  static async copyToEntity(entityType: string, entityId: number, source: DrizzleAttachment): Promise<DrizzleAttachment> {
    const [inserted] = await db
      .insert(attachments)
      .values({
        entityType,
        entityId,
        fileUrl: source.fileUrl,
        fileName: source.fileName,
        mimeType: source.mimeType,
        fileSize: source.fileSize,
        uploadedBy: source.uploadedBy ?? null,
      })
      .returning();
    if (!inserted) throw new Error('Failed to copy attachment');
    return inserted;
  }

  static async findByEntity(entityType: string, entityId: number): Promise<DrizzleAttachment[]> {
    return db.query.attachments.findMany({
      where: and(eq(attachments.entityType, entityType), eq(attachments.entityId, entityId)),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
  }

  static async findByEntityMany(entityType: string, entityIds: number[]): Promise<DrizzleAttachment[]> {
    if (!entityIds.length) return [];
    return db.query.attachments.findMany({
      where: and(eq(attachments.entityType, entityType), inArray(attachments.entityId, entityIds)),
    });
  }

  static async deleteById(id: number): Promise<void> {
    await db.delete(attachments).where(eq(attachments.id, id));
  }

  static async deleteByEntity(entityType: string, entityId: number): Promise<void> {
    await db.delete(attachments).where(and(eq(attachments.entityType, entityType), eq(attachments.entityId, entityId)));
  }
}
