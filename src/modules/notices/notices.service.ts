import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { Notice, notices } from './notices.schema';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';
import { FileBlobModel } from '../../common/models/FileBlob';
import { cleanupStoredFile } from '../../common/upload/cleanup-stored-file';
import { logger } from '../../lib/logger';

/** OCD-569: best-effort durable copy of the uploaded image - see FileBlobModel. */
const persistImage = (image?: Express.Multer.File): void => {
  if (!image) return;
  void FileBlobModel.persist(image).catch((err: unknown) =>
    logger.error({ err, filename: image.filename }, 'Failed to persist notice image to the database')
  );
};

@Injectable()
export class NoticesService {
  /**
   * Every employee/system user sees only active notices, newest first.
   *
   * OCD-565: `isActive` alone is no longer sufficient - a notice must also
   * fall inside its scheduled window (now >= startAt AND (endAt IS NULL OR
   * now <= endAt)). That's evaluated in application code against a single
   * `now` reading (rather than a SQL WHERE clause) so it stays unit-testable
   * without a live database - see notices-service.test.ts - and admins still
   * get every row regardless of window via listAll().
   */
  async listActive() {
    const rows = await db.select().from(notices).orderBy(desc(notices.createdAt));
    const now = new Date();
    return rows.filter((notice) => this.isCurrentlyVisible(notice, now));
  }

  private isCurrentlyVisible(notice: Notice, now: Date): boolean {
    if (!notice.isActive) return false;
    if (notice.startAt && notice.startAt.getTime() > now.getTime()) return false;
    if (notice.endAt && notice.endAt.getTime() < now.getTime()) return false;
    return true;
  }

  /** Notice-permission holders manage the full board, including inactive and scheduled/expired ones. */
  async listAll() {
    return db.select().from(notices).orderBy(desc(notices.createdAt));
  }

  /** OCD-565: endAt, when present, must be strictly after startAt. */
  private assertValidWindow(startAt?: Date | null, endAt?: Date | null): void {
    if (!startAt || !endAt) return;
    if (endAt.getTime() <= startAt.getTime()) {
      throw new BadRequestException('endAt must be after startAt');
    }
  }

  async create(dto: CreateNoticeDto, createdBy: number, image?: Express.Multer.File) {
    const startAt = new Date(dto.startAt);
    const endAt = dto.endAt ? new Date(dto.endAt) : null;
    this.assertValidWindow(startAt, endAt);

    const [notice] = await db
      .insert(notices)
      .values({
        title: dto.title,
        message: dto.message,
        imageUrl: image ? `/uploads/others/${image.filename}` : null,
        isActive: dto.isActive ?? true,
        startAt,
        endAt,
        createdBy,
        updatedBy: createdBy,
      })
      .returning();
    persistImage(image);
    return notice;
  }

  async update(id: number, dto: UpdateNoticeDto, updatedBy: number, image?: Express.Multer.File) {
    // Fetched unconditionally: the schedule window can only be validated
    // against the *merged* result (a PATCH may touch just one of
    // startAt/endAt, leaving the other at its current DB value), and the
    // previous imageUrl is needed below to clean it up when it's being
    // replaced or removed - each notice owns its image outright (no
    // copyToEntity-style sharing like tbl_attachments), so it's always safe
    // to delete as soon as this row stops pointing at it.
    const [existing] = await db.select().from(notices).where(eq(notices.id, id));
    if (!existing) throw new NotFoundException('Notice not found');

    if (dto.startAt !== undefined || dto.endAt !== undefined) {
      const mergedStartAt = dto.startAt !== undefined ? new Date(dto.startAt) : existing.startAt;
      const mergedEndAt = dto.endAt !== undefined ? new Date(dto.endAt) : existing.endAt;
      this.assertValidWindow(mergedStartAt, mergedEndAt);
    }

    const [notice] = await db
      .update(notices)
      .set({
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.message !== undefined && { message: dto.message }),
        ...(dto.startAt !== undefined && { startAt: new Date(dto.startAt) }),
        ...(dto.endAt !== undefined && { endAt: new Date(dto.endAt) }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        // A newly uploaded image wins over `removeImage` if both are somehow sent.
        ...(image ? { imageUrl: `/uploads/others/${image.filename}` } : dto.removeImage ? { imageUrl: null } : {}),
        updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(notices.id, id))
      .returning();
    if (!notice) throw new NotFoundException('Notice not found');
    persistImage(image);
    if ((image || dto.removeImage) && existing.imageUrl) void cleanupStoredFile(existing.imageUrl);
    return notice;
  }

  async remove(id: number) {
    const [deleted] = await db.delete(notices).where(eq(notices.id, id)).returning();
    if (!deleted) throw new NotFoundException('Notice not found');
    if (deleted.imageUrl) void cleanupStoredFile(deleted.imageUrl);
  }
}
