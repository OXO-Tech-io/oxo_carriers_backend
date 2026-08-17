import { db } from '../../db';
import { documents, type Document as DrizzleDocument } from '../../db/schema';
import { count, eq } from 'drizzle-orm';

export type DocumentTargetType = 'individual' | 'all';

export type DocumentInput = {
  title: string;
  description?: string | null;
  targetType: DocumentTargetType;
  createdBy: number;
};

export class DocumentModel {
  static async create(data: DocumentInput): Promise<DrizzleDocument> {
    const [inserted] = await db.insert(documents).values(data).returning();
    if (!inserted) throw new Error('Failed to create document');
    return inserted;
  }

  static async findById(id: number): Promise<DrizzleDocument | null> {
    const record = await db.query.documents.findFirst({ where: eq(documents.id, id) });
    return record ?? null;
  }

  static async listAll(limit: number, offset: number): Promise<DrizzleDocument[]> {
    return db.query.documents.findMany({
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit,
      offset,
    });
  }

  static async countAll(): Promise<number> {
    const [row] = await db.select({ count: count() }).from(documents);
    return row?.count ?? 0;
  }

  // Recipients cascade at the DB level (tbl_document_recipients FK); attachments
  // are polymorphic (no FK) and must be deleted separately by the caller.
  static async deleteById(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }
}
