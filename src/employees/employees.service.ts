import { Injectable } from '@nestjs/common';
import { EmployeeModel } from '../models/Employee';
import { UserRole } from '../types';

/**
 * Thin injectable wrapper around EmployeeModel so it can be constructor-
 * injected into guards/controllers/services instead of imported as a static
 * class everywhere. EmployeeModel itself is left untouched - it already
 * encapsulates the Drizzle queries and PII encrypt/decrypt.
 */
@Injectable()
export class EmployeesService {
  findByEmail(email: string) {
    return EmployeeModel.findByEmail(email);
  }

  findById(id: number) {
    return EmployeeModel.findById(id);
  }

  findByKeycloakSub(sub: string) {
    return EmployeeModel.findByKeycloakSub(sub);
  }

  linkKeycloakSub(userId: number, sub: string) {
    return EmployeeModel.linkKeycloakSub(userId, sub);
  }

  findOrCreateFromKeycloak(claims: {
    sub: string;
    email: string;
    first_name: string;
    last_name: string;
    role: UserRole;
  }) {
    return EmployeeModel.findOrCreateFromKeycloak(claims);
  }

  findByEmployeeId(employeeId: string) {
    return EmployeeModel.findByEmployeeId(employeeId);
  }

  findByVerificationToken(token: string) {
    return EmployeeModel.findByVerificationToken(token);
  }

  verifyEmail(userId: number) {
    return EmployeeModel.verifyEmail(userId);
  }

  create(data: Parameters<typeof EmployeeModel.create>[0]) {
    return EmployeeModel.create(data);
  }

  update(id: number, updates: Parameters<typeof EmployeeModel.update>[1]) {
    return EmployeeModel.update(id, updates);
  }

  getAll(filters?: Parameters<typeof EmployeeModel.getAll>[0]) {
    return EmployeeModel.getAll(filters);
  }

  delete(id: number) {
    return EmployeeModel.delete(id);
  }

  generateEmployeeId() {
    return EmployeeModel.generateEmployeeId();
  }
}
