import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { employeeNoteService } from './employeeNote.service';
import { EmployeeModel } from '../../employees/Employee';
import { JwtPayload, UserRole } from '../../types';
import { CreateEmployeeNoteDto } from './dto/create-employee-note.dto';
import { UpdateEmployeeNoteDto } from './dto/update-employee-note.dto';

const NOTE_CREATOR_ROLES: UserRole[] = [UserRole.HR_EXECUTIVE, UserRole.HR_MANAGER, UserRole.SUPER_ADMIN];

// OCD-480: notes are historical/audit records - only the note's own author,
// or someone holding a strictly more senior role than the author, may edit
// it. Mirrors the HR_MANAGER > HR_EXECUTIVE authority already established
// for Profile Approvals (OCD-473) - super_admin outranks everyone and never
// needs the ownership check (also bypasses RolesGuard on this route already).
const NOTE_ROLE_RANK: Partial<Record<UserRole, number>> = {
  [UserRole.HR_EXECUTIVE]: 1,
  [UserRole.HR_MANAGER]: 2,
  [UserRole.SUPER_ADMIN]: 3,
};

@Injectable()
export class EmployeeNotesService {
  // id here is the employee.id primary key - never the Keycloak sub/id.
  private async resolveEmployeeId(id: number): Promise<string> {
    const employee = await EmployeeModel.findById(id);
    if (!employee?.employeeId) {
      throw new BadRequestException('This user has no employee ID assigned yet');
    }
    return employee.employeeId;
  }

  async create(employee: JwtPayload, dto: CreateEmployeeNoteDto, files: Express.Multer.File[]) {
    if (!NOTE_CREATOR_ROLES.includes(employee.role)) {
      throw new ForbiddenException('Only HR Team or HR Manager can add employee notes');
    }
    const employeeId = await this.resolveEmployeeId(dto.employeeId);
    const note = await employeeNoteService.create(employeeId, employee.userId, dto.content, files);
    return { success: true, message: 'Note added', data: note };
  }

  async listForEmployee(employeeId: number) {
    const businessEmployeeId = await this.resolveEmployeeId(employeeId);
    const notes = await employeeNoteService.listForEmployee(businessEmployeeId);
    return { success: true, message: 'Notes fetched', data: notes };
  }

  async getById(id: number) {
    const note = await employeeNoteService.getById(id);
    if (!note) throw new NotFoundException('Note not found');
    return { success: true, message: 'Note fetched', data: note };
  }

  // OCD-480: enforced here (server-side), not just by hiding the Edit button
  // client-side - only the note's author, or a strictly more senior role,
  // may update it.
  async update(id: number, dto: UpdateEmployeeNoteDto, actor: JwtPayload) {
    const existing = await employeeNoteService.getById(id);
    if (!existing) throw new NotFoundException('Note not found');

    if (existing.authorUserId !== actor.userId && actor.role !== UserRole.SUPER_ADMIN) {
      const author = existing.authorUserId ? await EmployeeModel.findById(existing.authorUserId) : null;
      const authorRank = author ? NOTE_ROLE_RANK[author.role as UserRole] ?? 0 : 0;
      const actorRank = NOTE_ROLE_RANK[actor.role] ?? 0;
      if (actorRank <= authorRank) {
        throw new ForbiddenException(
          'You can only edit notes you authored, unless you hold a more senior role than the author'
        );
      }
    }

    const note = await employeeNoteService.update(id, dto.content);
    if (!note) throw new NotFoundException('Note not found');
    return { success: true, message: 'Note updated', data: note };
  }
}
