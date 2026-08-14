import { Controller, ForbiddenException, Get, Param, ParseIntPipe } from '@nestjs/common';
import { CurrentEmployee } from '../../common/decorators/current-employee.decorator';
import { hasPermission } from '../../middleware/permissions';
import { JwtPayload, UserRole } from '../../types';
import { PERMISSIONS } from '../../common/constants/permissions';
import { DocumentVaultService } from './document-vault.service';

@Controller('employees/:employeeId/documents')
export class EmployeeDocumentsController {
  constructor(private readonly documentVaultService: DocumentVaultService) {}

  // :employeeId is the internal tbl_employee.id - never the Keycloak sub.
  // Any authenticated employee reads their own merged view (targeted docs +
  // 'All Employees') for free; reading someone else's requires document_vault
  // write (or super admin) - the same gate the old admin-only route had.
  @Get()
  async list(@Param('employeeId', ParseIntPipe) employeeId: number, @CurrentEmployee() employee: JwtPayload) {
    if (employeeId === employee.userId) {
      const data = await this.documentVaultService.listForEmployee(employee.employeeId!);
      return { success: true, message: 'Documents fetched', data };
    }

    await this.requireDocumentVaultWrite(employee);
    const data = await this.documentVaultService.listForEmployeeByInternalId(employeeId);
    return { success: true, message: 'Documents fetched', data };
  }

  private async requireDocumentVaultWrite(employee: JwtPayload): Promise<void> {
    if (employee.role === UserRole.SUPER_ADMIN) return;
    if (!employee.employeeId || !(await hasPermission(employee.employeeId, PERMISSIONS.DOCUMENT_VAULT, 'write'))) {
      throw new ForbiddenException('Forbidden');
    }
  }
}
