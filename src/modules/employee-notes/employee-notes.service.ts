import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { employeeNoteService } from '../../services/employeeNote.service';
import { JwtPayload, UserRole } from '../../types';
import { CreateEmployeeNoteDto } from './dto/create-employee-note.dto';
import { UpdateEmployeeNoteDto } from './dto/update-employee-note.dto';

const NOTE_CREATOR_ROLES: UserRole[] = [UserRole.HR_EXECUTIVE, UserRole.HR_MANAGER, UserRole.SUPER_ADMIN];

@Injectable()
export class EmployeeNotesService {
  async create(employee: JwtPayload, dto: CreateEmployeeNoteDto, files: Express.Multer.File[]) {
    if (!NOTE_CREATOR_ROLES.includes(employee.role)) {
      throw new ForbiddenException('Only HR Team or HR Manager can add employee notes');
    }
    const note = await employeeNoteService.create(dto.employeeUserId, employee.userId, dto.content, files);
    return { success: true, message: 'Note added', data: note };
  }

  async listForEmployee(employeeUserId: number) {
    const notes = await employeeNoteService.listForEmployee(employeeUserId);
    return { success: true, message: 'Notes fetched', data: notes };
  }

  async getById(id: number) {
    const note = await employeeNoteService.getById(id);
    if (!note) throw new NotFoundException('Note not found');
    return { success: true, message: 'Note fetched', data: note };
  }

  async update(id: number, dto: UpdateEmployeeNoteDto) {
    const note = await employeeNoteService.update(id, dto.content);
    if (!note) throw new NotFoundException('Note not found');
    return { success: true, message: 'Note updated', data: note };
  }
}
