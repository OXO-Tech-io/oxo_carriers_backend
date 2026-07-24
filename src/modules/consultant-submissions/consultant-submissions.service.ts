import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsultantWorkSubmissionModel } from './ConsultantWorkSubmission';
import { ConsultantSubmissionStatus, JwtPayload, UserRole } from '../../types';
import { CreateConsultantSubmissionDto } from './dto/create-consultant-submission.dto';
import { ResubmitConsultantSubmissionDto } from './dto/resubmit-consultant-submission.dto';
import { DecideConsultantSubmissionDto } from './dto/decide-consultant-submission.dto';

@Injectable()
export class ConsultantSubmissionsService {
  /**
   * Required-field presence (project/tech/total_hours) and employeeId are
   * enforced by requireEmployeeId/validateRequiredFields middleware in the
   * original Express routes - reproduced here since Nest has no direct
   * equivalent wired up for this module.
   */
  async submit(employee: JwtPayload, dto: CreateConsultantSubmissionDto, file: Express.Multer.File | undefined) {
    if (employee.role !== UserRole.CONSULTANT) {
      throw new ForbiddenException('Only consultants can submit work');
    }

    this.assertRequiredFields(dto);

    const { project, tech, total_hours, comment } = dto;
    if (isNaN(parseFloat(total_hours!))) {
      throw new BadRequestException('Total hours must be a number');
    }
    const hours = parseFloat(total_hours!);
    if (hours <= 0) throw new BadRequestException('Total hours must be greater than 0');

    if (!file) throw new BadRequestException('Log sheet (Excel) is required');
    const log_sheet_url = `/uploads/documents/${file.filename}`;

    const submission = await ConsultantWorkSubmissionModel.create({
      employee_id: employee.employeeId!,
      project: project!.trim(),
      tech: tech!.trim(),
      total_hours: hours,
      comment: comment?.trim() || null,
      log_sheet_url,
    });

    return { success: true, message: 'Work submission created', submission };
  }

  async getMySubmissions(employee: JwtPayload, status?: ConsultantSubmissionStatus) {
    const employeeId = employee.employeeId;
    if (!employeeId) throw new BadRequestException('Employee ID not found on this account');
    const submissions = await ConsultantWorkSubmissionModel.findByEmployeeId(employeeId, { status });
    return { success: true, submissions };
  }

  async getAll(status?: ConsultantSubmissionStatus) {
    const submissions = await ConsultantWorkSubmissionModel.getAll({ status });
    return { success: true, submissions };
  }

  /** Single list endpoint - branches on role so the frontend only calls one route. */
  async getSubmissions(employee: JwtPayload, status?: ConsultantSubmissionStatus) {
    if (employee.role === UserRole.HR_MANAGER || employee.role === UserRole.HR_EXECUTIVE) {
      return this.getAll(status);
    }
    return this.getMySubmissions(employee, status);
  }

  async getSubmissionById(employee: JwtPayload, id: number) {
    const submission = await ConsultantWorkSubmissionModel.findById(id);
    if (!submission) throw new NotFoundException('Submission not found');

    if (
      employee.role !== UserRole.HR_MANAGER &&
      employee.role !== UserRole.HR_EXECUTIVE &&
      submission.employee_id !== employee.employeeId
    ) {
      throw new ForbiddenException('Forbidden');
    }

    return { success: true, submission };
  }

  /** Single decision endpoint - approve or reject, chosen via body.action. */
  async decideSubmission(employee: JwtPayload, id: number, dto: DecideConsultantSubmissionDto) {
    const { action, admin_comment } = dto;

    if (employee.role !== UserRole.HR_MANAGER && employee.role !== UserRole.HR_EXECUTIVE) {
      throw new ForbiddenException('Only HR can review consultant submissions');
    }

    if (action !== 'approve' && action !== 'reject') {
      throw new BadRequestException("action must be 'approve' or 'reject'");
    }

    if (action === 'reject' && (!admin_comment || typeof admin_comment !== 'string' || !admin_comment.trim())) {
      throw new BadRequestException('Admin comment is required for rejection');
    }

    const existing = await ConsultantWorkSubmissionModel.findById(id);
    if (!existing) throw new NotFoundException('Submission not found');

    const newStatus = action === 'approve' ? ConsultantSubmissionStatus.APPROVED : ConsultantSubmissionStatus.REJECTED;

    let updated;
    try {
      updated = await ConsultantWorkSubmissionModel.updateStatusTransactional(
        id,
        ConsultantSubmissionStatus.PENDING,
        newStatus,
        employee.userId,
        action === 'reject' ? admin_comment!.trim() : null,
      );
    } catch (err: unknown) {
      // Matches the original's 400 (not 409) for a submission that was
      // already reviewed by the time the row lock was acquired.
      if (err instanceof Error && err.message === 'SUBMISSION_NOT_PENDING') {
        throw new BadRequestException('Submission is not pending');
      }
      throw err;
    }

    if (!updated) throw new NotFoundException('Submission not found');

    return {
      success: true,
      message: action === 'approve' ? 'Submission approved' : 'Submission rejected',
      submission: updated,
    };
  }

  async resubmit(employee: JwtPayload, id: number, dto: ResubmitConsultantSubmissionDto, file: Express.Multer.File | undefined) {
    if (employee.role !== UserRole.CONSULTANT) {
      throw new ForbiddenException('Only consultants can resubmit');
    }

    const { project, tech, total_hours, comment } = dto;
    const original = await ConsultantWorkSubmissionModel.findById(id);
    if (!original) throw new NotFoundException('Original submission not found');
    if (original.employee_id !== employee.employeeId) throw new ForbiddenException('Forbidden');
    if (original.status !== ConsultantSubmissionStatus.REJECTED) {
      throw new BadRequestException('Only rejected submissions can be resubmitted');
    }

    const projectVal = project?.trim() || original.project;
    const techVal = tech?.trim() || original.tech;
    const hoursVal =
      total_hours != null && !isNaN(parseFloat(total_hours)) ? parseFloat(total_hours) : original.total_hours;
    if (hoursVal <= 0) throw new BadRequestException('Total hours must be greater than 0');

    if (!file) throw new BadRequestException('Log sheet (Excel) is required for resubmission');
    const log_sheet_url = `/uploads/documents/${file.filename}`;

    const submission = await ConsultantWorkSubmissionModel.create({
      employee_id: employee.employeeId!,
      project: projectVal,
      tech: techVal,
      total_hours: hoursVal,
      comment: comment?.trim() || original.comment,
      log_sheet_url,
      resubmission_of: id,
    });

    return { success: true, message: 'Work resubmitted', submission };
  }

  private assertRequiredFields(dto: CreateConsultantSubmissionDto) {
    const fields: Array<keyof CreateConsultantSubmissionDto> = ['project', 'tech', 'total_hours'];
    const missing = fields.filter((field) => {
      const value = dto[field];
      return value === undefined || value === null || (typeof value === 'string' && !value.trim());
    });
    if (missing.length > 0) {
      throw new BadRequestException(`Missing required fields: ${missing.join(', ')}`);
    }
  }
}
