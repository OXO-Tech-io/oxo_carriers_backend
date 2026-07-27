import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { employeeNoteService } from './employeeNote.service';
import { EmployeeModel } from '../../employees/Employee';
import { JwtPayload, UserRole } from '../../types';
import { CreateEmployeeNoteDto } from './dto/create-employee-note.dto';
import { UpdateEmployeeNoteDto } from './dto/update-employee-note.dto';

const NOTE_CREATOR_ROLES: UserRole[] = [UserRole.HR_EXECUTIVE, UserRole.HR_MANAGER, UserRole.SUPER_ADMIN];

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

  async update(id: number, dto: UpdateEmployeeNoteDto) {
    const note = await employeeNoteService.update(id, dto.content);
    if (!note) throw new NotFoundException('Note not found');
    return { success: true, message: 'Note updated', data: note };
  }
}
