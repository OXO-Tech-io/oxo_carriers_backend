import { Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { notices } from './notices.schema';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';

@Injectable()
export class NoticesService {
  /** Every employee/system user sees only active notices, newest first. */
  async listActive() {
    return db.select().from(notices).where(eq(notices.isActive, true)).orderBy(desc(notices.createdAt));
  }

  /** Notice-permission holders manage the full board, including inactive ones. */
  async listAll() {
    return db.select().from(notices).orderBy(desc(notices.createdAt));
  }

  async create(dto: CreateNoticeDto, createdBy: number, image?: Express.Multer.File) {
    const [notice] = await db
      .insert(notices)
      .values({
        title: dto.title,
        message: dto.message,
        imageUrl: image ? `/uploads/others/${image.filename}` : null,
        isActive: dto.isActive ?? true,
        createdBy,
        updatedBy: createdBy,
      })
      .returning();
    return notice;
  }

  async update(id: number, dto: UpdateNoticeDto, updatedBy: number, image?: Express.Multer.File) {
    const [notice] = await db
      .update(notices)
      .set({
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.message !== undefined && { message: dto.message }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        // A newly uploaded image wins over `removeImage` if both are somehow sent.
        ...(image ? { imageUrl: `/uploads/others/${image.filename}` } : dto.removeImage ? { imageUrl: null } : {}),
        updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(notices.id, id))
      .returning();
    if (!notice) throw new NotFoundException('Notice not found');
    return notice;
  }

  async remove(id: number) {
    const [deleted] = await db.delete(notices).where(eq(notices.id, id)).returning();
    if (!deleted) throw new NotFoundException('Notice not found');
  }
}
