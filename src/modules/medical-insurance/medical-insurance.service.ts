import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MedicalInsuranceModel, getCurrentQuarter, getMaxAmountForType } from './MedicalInsurance';
import { JwtPayload, MedicalClaimStatus, MedicalClaimPaymentStatus, MedicalClaimType, UserRole } from '../../types';
import { logger } from '../../lib/logger';
import {
  sendMedicalClaimApprovedEmail,
  sendMedicalClaimRejectedEmail,
  sendMedicalClaimSubmittedEmail,
} from '../../config/email';
import { CreateMedicalClaimDto } from './dto/create-medical-claim.dto';
import { ResubmitMedicalClaimDto } from './dto/resubmit-medical-claim.dto';
import { DecideMedicalClaimDto } from './dto/decide-medical-claim.dto';
import { UpdateMedicalClaimPaymentDto } from './dto/update-medical-claim-payment.dto';
import { hasPermission } from '../../middleware/permissions';
import { AccessLevel, PERMISSIONS, PermissionKey } from '../../common/constants/permissions';

const HR_ROLES = [UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE];

export type MedicalDocumentFiles = {
  supportive_document?: Express.Multer.File[];
  relevant_document?: Express.Multer.File[];
};

@Injectable()
export class MedicalInsuranceService {
  private requireEmployeeId(employee: JwtPayload): string {
    if (!employee.employeeId) {
      throw new BadRequestException('Your account has no employee ID assigned yet');
    }
    return employee.employeeId;
  }

  /** Mirrors VouchersService.hasRoleOrPermission: a hardcoded role always
   * qualifies, otherwise fall back to the granular tbl_user_permissions grant
   * so permission-granted users (not just HR by role) can view/manage claims. */
  private async hasRoleOrPermission(
    employee: JwtPayload,
    allowedRoles: UserRole[],
    permission: PermissionKey,
    requiredLevel: AccessLevel = 'read',
  ): Promise<boolean> {
    const role = employee?.role;
    const employeeId = employee?.employeeId;

    if (!role || !employeeId) {
      return false;
    }

    if (role === UserRole.SUPER_ADMIN || allowedRoles.includes(role)) {
      return true;
    }

    return hasPermission(employeeId, permission, requiredLevel);
  }

  async apply(employee: JwtPayload, dto: CreateMedicalClaimDto, files: MedicalDocumentFiles | undefined) {
    const employeeId = this.requireEmployeeId(employee);
    const type = dto.type as MedicalClaimType;
    const quarter = dto.quarter || getCurrentQuarter();
    const amount = parseFloat(dto.amount as string);

    if (!type || (type !== MedicalClaimType.IN && type !== MedicalClaimType.OPD)) {
      throw new BadRequestException('Type must be IN or OPD');
    }
    if (amount == null || isNaN(amount) || amount <= 0) {
      throw new BadRequestException('Valid amount is required');
    }

    const maxAmount = getMaxAmountForType(type);
    if (amount > maxAmount) {
      throw new BadRequestException(
        `${type} claim amount cannot exceed ${maxAmount.toLocaleString()}${type === 'OPD' ? ' per quarter' : ''}`,
      );
    }

    if (type === MedicalClaimType.OPD) {
      const used = await MedicalInsuranceModel.getUsedOPDAmountForQuarter(employeeId, quarter);
      if (used + amount > maxAmount) {
        throw new BadRequestException(
          `OPD quarter limit exceeded. Used: ${used.toLocaleString()}, limit: ${maxAmount.toLocaleString()} for ${quarter}`,
        );
      }
    }

    const supportiveFile = files?.supportive_document?.[0];
    if (!supportiveFile) {
      throw new BadRequestException('Supportive document is required');
    }
    const supportive_document_url = `/uploads/documents/${supportiveFile.filename}`;
    const relevantFile = files?.relevant_document?.[0];
    const relevant_document_url = relevantFile ? `/uploads/documents/${relevantFile.filename}` : null;

    const claim = await MedicalInsuranceModel.create({
      employee_id: employeeId,
      type,
      quarter,
      amount,
      supportive_document_url,
      relevant_document_url,
    });

    // Confirmation email to employee (non-blocking, matches the original
    // controller's fire-and-forget try/catch after responding).
    void this.sendSubmittedEmail(claim);

    return { success: true, message: 'Medical insurance claim submitted', claim };
  }

  async getMyClaims(employeeId: string, status?: MedicalClaimStatus) {
    const claims = await MedicalInsuranceModel.findByEmployeeId(employeeId, { status });
    return { success: true, claims };
  }

  async getAll(status?: MedicalClaimStatus, type?: MedicalClaimType, paymentStatus?: MedicalClaimPaymentStatus) {
    const claims = await MedicalInsuranceModel.getAll({ status, type, payment_status: paymentStatus });
    return { success: true, claims };
  }

  /** Single list endpoint - branches on role/permission so the frontend only calls one route. */
  async getClaims(
    employee: JwtPayload,
    status?: MedicalClaimStatus,
    type?: MedicalClaimType,
    paymentStatus?: MedicalClaimPaymentStatus,
  ) {
    const canViewAll = await this.hasRoleOrPermission(employee, HR_ROLES, PERMISSIONS.MEDICAL_CLAIMS);
    if (canViewAll) {
      return this.getAll(status, type, paymentStatus);
    }
    return this.getMyClaims(this.requireEmployeeId(employee), status);
  }

  async getClaimById(employee: JwtPayload, id: number) {
    const claim = await MedicalInsuranceModel.findById(id);
    if (!claim) {
      throw new NotFoundException('Claim not found');
    }
    if (claim.employee_id !== employee.employeeId) {
      const canViewAll = await this.hasRoleOrPermission(employee, HR_ROLES, PERMISSIONS.MEDICAL_CLAIMS);
      if (!canViewAll) {
        throw new ForbiddenException('Forbidden');
      }
    }
    return { success: true, claim };
  }

  /** The submitting employee (their own claim) or a permission-granted user
   * (any claim) can remove it, only while it's still awaiting a decision. */
  async deleteClaim(employee: JwtPayload, id: number) {
    const claim = await MedicalInsuranceModel.findById(id);
    if (!claim) {
      throw new NotFoundException('Claim not found');
    }
    const isOwner = claim.employee_id === employee.employeeId;
    if (!isOwner) {
      const canManage = await this.hasRoleOrPermission(employee, HR_ROLES, PERMISSIONS.MEDICAL_CLAIMS, 'write');
      if (!canManage) {
        throw new ForbiddenException('Forbidden');
      }
    }
    if (claim.status !== MedicalClaimStatus.PENDING) {
      throw new BadRequestException('Only claims awaiting a decision can be removed');
    }
    await MedicalInsuranceModel.deleteById(id);
    return { success: true, message: 'Claim removed' };
  }

  /** Single decision endpoint - approve or reject, chosen via body.action. */
  async decideClaim(employee: JwtPayload, id: number, dto: DecideMedicalClaimDto) {
    const { action, admin_comment } = dto;

    const canDecide = await this.hasRoleOrPermission(employee, HR_ROLES, PERMISSIONS.MEDICAL_CLAIMS, 'write');
    if (!canDecide) {
      throw new ForbiddenException('Only HR can review medical claims');
    }

    if (action !== 'approve' && action !== 'reject') {
      throw new BadRequestException("action must be 'approve' or 'reject'");
    }

    if (action === 'reject' && (!admin_comment || typeof admin_comment !== 'string' || !admin_comment.trim())) {
      throw new BadRequestException('Admin comment is required for rejection');
    }

    const claim = await MedicalInsuranceModel.findById(id);
    if (!claim) {
      throw new NotFoundException('Claim not found');
    }
    if (claim.status !== MedicalClaimStatus.PENDING) {
      throw new BadRequestException('Claim is not pending');
    }

    const newStatus = action === 'approve' ? MedicalClaimStatus.APPROVED : MedicalClaimStatus.REJECTED;
    const updated = await MedicalInsuranceModel.updateStatus(
      id,
      newStatus,
      employee.userId,
      action === 'reject' ? admin_comment!.trim() : null,
    );

    // Decision email to employee (non-blocking).
    void this.sendDecisionEmail(action, updated, admin_comment);

    return {
      success: true,
      message: action === 'approve' ? 'Claim approved' : 'Claim rejected',
      claim: updated,
    };
  }

  /** Permission-granted user records the bank-deposit payment status against
   * an approved claim - visible to the employee the same way vendor payment
   * status is, since getClaimById/getMyClaims already return the full row. */
  async updatePaymentStatus(employee: JwtPayload, id: number, dto: UpdateMedicalClaimPaymentDto) {
    const canUpdate = await this.hasRoleOrPermission(employee, HR_ROLES, PERMISSIONS.MEDICAL_CLAIMS, 'write');
    if (!canUpdate) {
      throw new ForbiddenException('Insufficient permission to update claim payment status');
    }

    const paymentStatus = dto.payment_status as MedicalClaimPaymentStatus;
    if (
      paymentStatus !== MedicalClaimPaymentStatus.PARTIALLY_PAID &&
      paymentStatus !== MedicalClaimPaymentStatus.PAID
    ) {
      throw new BadRequestException("payment_status must be 'partially_paid' or 'paid'");
    }

    const claim = await MedicalInsuranceModel.findById(id);
    if (!claim) {
      throw new NotFoundException('Claim not found');
    }
    if (claim.status !== MedicalClaimStatus.APPROVED) {
      throw new BadRequestException('Only approved claims can have a payment recorded');
    }

    const claimAmount = parseFloat(String(claim.amount));
    let paidAmount: number | null;
    if (dto.paid_amount != null && dto.paid_amount !== '') {
      paidAmount = parseFloat(dto.paid_amount);
      if (isNaN(paidAmount) || paidAmount <= 0) {
        throw new BadRequestException('Valid paid_amount is required');
      }
      if (paidAmount > claimAmount) {
        throw new BadRequestException('paid_amount cannot exceed the claim amount');
      }
    } else {
      paidAmount = paymentStatus === MedicalClaimPaymentStatus.PAID ? claimAmount : null;
      if (paidAmount == null) {
        throw new BadRequestException('paid_amount is required for a partial payment');
      }
    }

    if (paymentStatus === MedicalClaimPaymentStatus.PARTIALLY_PAID && paidAmount >= claimAmount) {
      throw new BadRequestException('paid_amount must be less than the claim amount for a partial payment');
    }

    const updated = await MedicalInsuranceModel.updatePaymentStatus(id, paymentStatus, employee.userId, {
      paid_amount: paidAmount,
      payment_reference: dto.payment_reference?.trim() || null,
    });

    return {
      success: true,
      message: paymentStatus === MedicalClaimPaymentStatus.PAID ? 'Claim marked as paid' : 'Claim marked as partially paid',
      claim: updated,
    };
  }

  async resubmit(
    employee: JwtPayload,
    id: number,
    dto: ResubmitMedicalClaimDto,
    files: MedicalDocumentFiles | undefined,
  ) {
    const employeeId = this.requireEmployeeId(employee);
    const type = (dto.type as MedicalClaimType) || undefined;
    const quarter = dto.quarter || undefined;
    const amount = dto.amount != null ? parseFloat(dto.amount) : undefined;

    const original = await MedicalInsuranceModel.findById(id);
    if (!original) {
      throw new NotFoundException('Original claim not found');
    }
    if (original.employee_id !== employeeId) {
      throw new ForbiddenException('Forbidden');
    }
    if (original.status !== MedicalClaimStatus.REJECTED) {
      throw new BadRequestException('Only rejected claims can be resubmitted');
    }

    const finalType = type || original.type;
    const finalQuarter = quarter || original.quarter;
    const finalAmount = amount != null && !isNaN(amount) ? amount : original.amount;

    const maxAmount = getMaxAmountForType(finalType);
    if (finalAmount > maxAmount) {
      throw new BadRequestException(
        `${finalType} claim amount cannot exceed ${maxAmount.toLocaleString()}${finalType === 'OPD' ? ' per quarter' : ''}`,
      );
    }

    if (finalType === MedicalClaimType.OPD) {
      const used = await MedicalInsuranceModel.getUsedOPDAmountForQuarter(employeeId, finalQuarter);
      if (used + finalAmount > maxAmount) {
        throw new BadRequestException(`OPD quarter limit exceeded for ${finalQuarter}`);
      }
    }

    const supportiveFile = files?.supportive_document?.[0];
    if (!supportiveFile) {
      throw new BadRequestException('Supportive document is required for resubmission');
    }
    const supportive_document_url = `/uploads/documents/${supportiveFile.filename}`;
    const relevantFile = files?.relevant_document?.[0];
    const relevant_document_url = relevantFile
      ? `/uploads/documents/${relevantFile.filename}`
      : (original.relevant_document_url ?? null);

    const claim = await MedicalInsuranceModel.create({
      employee_id: employeeId,
      type: finalType,
      quarter: finalQuarter,
      amount: finalAmount,
      supportive_document_url,
      relevant_document_url,
      resubmission_of: id,
    });

    return { success: true, message: 'Claim resubmitted', claim };
  }

  getLimits() {
    return {
      success: true,
      limits: {
        IN: { maxPerClaim: 300000, description: 'In-patient up to 300,000' },
        OPD: { maxPerQuarter: 6000, yearlyTotal: 24000, description: 'Out-patient 6,000 per quarter (24,000 per year)' },
      },
      currentQuarter: getCurrentQuarter(),
    };
  }

  private async sendSubmittedEmail(claim: Awaited<ReturnType<typeof MedicalInsuranceModel.create>>) {
    try {
      const employeeName = claim.user ? `${claim.user.first_name} ${claim.user.last_name}`.trim() : 'Employee';
      const employeeEmail = claim.user?.email;
      if (employeeEmail) {
        await sendMedicalClaimSubmittedEmail(employeeEmail, {
          employeeName,
          claimId: `CLM-${claim.id}`,
          claimType: claim.type,
          claimAmount: `${parseFloat(String(claim.amount)).toLocaleString()}`,
          submissionDate: new Date().toLocaleDateString('en-GB'),
        });
      }
    } catch (emailErr: unknown) {
      logger.error({ err: emailErr }, 'Failed to send medical claim submitted email');
    }
  }

  private async sendDecisionEmail(
    action: 'approve' | 'reject',
    updated: Awaited<ReturnType<typeof MedicalInsuranceModel.updateStatus>>,
    admin_comment?: string,
  ) {
    try {
      const employeeName = updated?.user ? `${updated.user.first_name} ${updated.user.last_name}`.trim() : 'Employee';
      const employeeEmail = updated?.user?.email;
      if (employeeEmail && updated) {
        if (action === 'approve') {
          await sendMedicalClaimApprovedEmail(employeeEmail, {
            employeeName,
            claimId: `CLM-${updated.id}`,
            claimType: updated.type,
            claimAmount: `${parseFloat(String(updated.amount)).toLocaleString()}`,
            approvedAmount: `${parseFloat(String(updated.amount)).toLocaleString()}`,
            approvalDate: new Date().toLocaleDateString('en-GB'),
            settlementInfo: 'Bank Direct Deposit',
            processingTimeline: '2-4 Business Days',
          });
        } else {
          await sendMedicalClaimRejectedEmail(employeeEmail, {
            employeeName,
            claimId: `CLM-${updated.id}`,
            claimType: updated.type,
            claimAmount: `${parseFloat(String(updated.amount)).toLocaleString()}`,
            rejectionReason: (admin_comment ?? '').trim(),
            requiredCorrections: 'Please review the rejection reason and resubmit with corrected documentation.',
          });
        }
      }
    } catch (emailErr: unknown) {
      logger.error({ err: emailErr }, 'Failed to send medical claim decision email');
    }
  }
}
