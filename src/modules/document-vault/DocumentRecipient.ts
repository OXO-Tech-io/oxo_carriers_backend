import { db } from '../../db';
import { documentRecipients, documents, type DocumentRecipient as DrizzleRecipient } from '../../db/schema';
import { and, desc, eq, isNotNull, or } from 'drizzle-orm';

export class DocumentRecipientModel {
  static async createMany(documentId: number, employeeIds: string[]): Promise<DrizzleRecipient[]> {
    if (!employeeIds.length) return [];
    return db
      .insert(documentRecipients)
      .values(employeeIds.map((employeeId) => ({ documentId, employeeId })))
      .returning();
  }

  static async listByDocumentId(documentId: number) {
    return db.query.documentRecipients.findMany({
      where: eq(documentRecipients.documentId, documentId),
    });
  }

  /**
   * Merged view for one employee: every document targeted at 'all' PLUS any
   * document targeted at them individually. Left-joins the recipient row
   * filtered to this employeeId so at most one row comes back per document
   * (no duplicate fan-out), then keeps rows where the document is 'all' or a
   * matching recipient row was found.
   */
  static async listForEmployee(employeeId: string) {
    const rows = await db
      .select({
        id: documents.id,
        title: documents.title,
        description: documents.description,
        targetType: documents.targetType,
        createdBy: documents.createdBy,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .leftJoin(
        documentRecipients,
        and(eq(documentRecipients.documentId, documents.id), eq(documentRecipients.employeeId, employeeId)),
      )
      .where(or(eq(documents.targetType, 'all'), isNotNull(documentRecipients.id)))
      .orderBy(desc(documents.createdAt));
    return rows;
  }
}
