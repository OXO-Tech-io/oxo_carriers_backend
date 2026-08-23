import { db } from '../db';
import { employeePii } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { env } from '../config/env';
import { pgpDecrypt, pgpEncrypt } from '../utils/pgpCrypto';

type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'delete'>;

export class EmployeePiiModel {
  private static getKey(): string {
    return env.PII_ENCRYPTION_KEY;
  }

  static async findByEmployeeId(employeeId: string, executor: DbExecutor = db) {
    const key = this.getKey();

    // Use SQL templates inside select to decrypt binary columns.
    // Wrap with COALESCE or CASE WHEN to handle potential nulls if needed,
    // though pgp_sym_decrypt(NULL, key) returns NULL in PostgreSQL.
    const results = await executor
      .select({
        id: employeePii.id,
        employeeId: employeePii.employeeId,
        passportNumber: sql<string | null>`CASE WHEN ${employeePii.passportNumber} IS NULL THEN NULL ELSE pgp_sym_decrypt(${employeePii.passportNumber}, ${key}) END`,
        nationalId: sql<string | null>`CASE WHEN ${employeePii.nationalId} IS NULL THEN NULL ELSE pgp_sym_decrypt(${employeePii.nationalId}, ${key}) END`,
        address: sql<string | null>`CASE WHEN ${employeePii.address} IS NULL THEN NULL ELSE pgp_sym_decrypt(${employeePii.address}, ${key}) END`,
        addressLine1: sql<string | null>`CASE WHEN ${employeePii.addressLine1} IS NULL THEN NULL ELSE pgp_sym_decrypt(${employeePii.addressLine1}, ${key}) END`,
        addressLine2: sql<string | null>`CASE WHEN ${employeePii.addressLine2} IS NULL THEN NULL ELSE pgp_sym_decrypt(${employeePii.addressLine2}, ${key}) END`,
        city: sql<string | null>`CASE WHEN ${employeePii.city} IS NULL THEN NULL ELSE pgp_sym_decrypt(${employeePii.city}, ${key}) END`,
        district: sql<string | null>`CASE WHEN ${employeePii.district} IS NULL THEN NULL ELSE pgp_sym_decrypt(${employeePii.district}, ${key}) END`,
        bloodType: sql<string | null>`CASE WHEN ${employeePii.bloodType} IS NULL THEN NULL ELSE pgp_sym_decrypt(${employeePii.bloodType}, ${key}) END`,
        emergencyContactName: sql<string | null>`CASE WHEN ${employeePii.emergencyContactName} IS NULL THEN NULL ELSE pgp_sym_decrypt(${employeePii.emergencyContactName}, ${key}) END`,
        emergencyContactPhone: sql<string | null>`CASE WHEN ${employeePii.emergencyContactPhone} IS NULL THEN NULL ELSE pgp_sym_decrypt(${employeePii.emergencyContactPhone}, ${key}) END`,
        emergencyContactRelationship: sql<string | null>`CASE WHEN ${employeePii.emergencyContactRelationship} IS NULL THEN NULL ELSE pgp_sym_decrypt(${employeePii.emergencyContactRelationship}, ${key}) END`,
        // Tab 1 (statutory) fields
        legalName: pgpDecrypt(employeePii.legalName),
        initialsName: pgpDecrypt(employeePii.initialsName),
        callingName: pgpDecrypt(employeePii.callingName),
        dateOfBirth: employeePii.dateOfBirth,
        birthPlace: pgpDecrypt(employeePii.birthPlace),
        sex: employeePii.sex,
        maritalStatus: employeePii.maritalStatus,
        nationality: employeePii.nationality,
        religion: employeePii.religion,
        spouseName: pgpDecrypt(employeePii.spouseName),
        spouseNic: pgpDecrypt(employeePii.spouseNic),
        spouseDateOfBirth: employeePii.spouseDateOfBirth,
        spouseContactNumber: pgpDecrypt(employeePii.spouseContactNumber),
        spouseOccupation: pgpDecrypt(employeePii.spouseOccupation),
        motherName: pgpDecrypt(employeePii.motherName),
        motherOccupation: pgpDecrypt(employeePii.motherOccupation),
        motherContactNumber: pgpDecrypt(employeePii.motherContactNumber),
        fatherName: pgpDecrypt(employeePii.fatherName),
        fatherOccupation: pgpDecrypt(employeePii.fatherOccupation),
        fatherContactNumber: pgpDecrypt(employeePii.fatherContactNumber),
        siblingDetails: employeePii.siblingDetails,
        primarySchool: employeePii.primarySchool,
        secondarySchool: employeePii.secondarySchool,
        // Tab B (remittance/correspondence) fields
        residingAddressLine1: pgpDecrypt(employeePii.residingAddressLine1),
        residingAddressLine2: pgpDecrypt(employeePii.residingAddressLine2),
        residingCity: pgpDecrypt(employeePii.residingCity),
        residingDistrict: pgpDecrypt(employeePii.residingDistrict),
        landlineNumber: pgpDecrypt(employeePii.landlineNumber),
        secondaryContactNumber: pgpDecrypt(employeePii.secondaryContactNumber),
        gramaNiladariDivision: employeePii.gramaNiladariDivision,
        electorate: employeePii.electorate,
        postalCode: employeePii.postalCode,
        // Health fields
        medicalConditions: pgpDecrypt(employeePii.medicalConditions),
        allergies: pgpDecrypt(employeePii.allergies),
        // Social & declaration fields
        linkedinProfile: employeePii.linkedinProfile,
        additionalNotes: employeePii.additionalNotes,
        declarationAccepted: employeePii.declarationAccepted,
        declarationAcceptedAt: employeePii.declarationAcceptedAt,
        createdAt: employeePii.createdAt,
        updatedAt: employeePii.updatedAt,
      })
      .from(employeePii)
      .where(eq(employeePii.employeeId, employeeId));

    return results[0] || null;
  }

  static async upsert(
    employeeId: string,
    data: {
      passportNumber?: string | null;
      nationalId?: string | null;
      address?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      district?: string | null;
      bloodType?: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
      emergencyContactRelationship?: string | null;
      legalName?: string | null;
      initialsName?: string | null;
      callingName?: string | null;
      birthPlace?: string | null;
      spouseName?: string | null;
      spouseNic?: string | null;
      spouseContactNumber?: string | null;
      spouseOccupation?: string | null;
      motherName?: string | null;
      motherOccupation?: string | null;
      motherContactNumber?: string | null;
      fatherName?: string | null;
      fatherOccupation?: string | null;
      fatherContactNumber?: string | null;
      residingAddressLine1?: string | null;
      residingAddressLine2?: string | null;
      residingCity?: string | null;
      residingDistrict?: string | null;
      landlineNumber?: string | null;
      secondaryContactNumber?: string | null;
      medicalConditions?: string | null;
      allergies?: string | null;
      dateOfBirth?: string | null;
      spouseDateOfBirth?: string | null;
      sex?: 'male' | 'female' | null;
      maritalStatus?: 'married' | 'single' | null;
      nationality?: string | null;
      religion?: string | null;
      siblingDetails?: string | null;
      primarySchool?: string | null;
      secondarySchool?: string | null;
      gramaNiladariDivision?: string | null;
      electorate?: string | null;
      postalCode?: string | null;
      linkedinProfile?: string | null;
      additionalNotes?: string | null;
      declarationAccepted?: boolean;
      declarationAcceptedAt?: Date | null;
    },
    executor: DbExecutor = db
  ) {
    const key = this.getKey();

    const valuesToInsert: any = {
      employeeId,
      updatedAt: new Date(),
    };

    const encryptedFields: (keyof typeof data)[] = [
      'passportNumber',
      'nationalId',
      'address',
      'addressLine1',
      'addressLine2',
      'city',
      'district',
      'bloodType',
      'emergencyContactName',
      'emergencyContactPhone',
      'emergencyContactRelationship',
      'legalName',
      'initialsName',
      'callingName',
      'birthPlace',
      'spouseName',
      'spouseNic',
      'spouseContactNumber',
      'spouseOccupation',
      'motherName',
      'motherOccupation',
      'motherContactNumber',
      'fatherName',
      'fatherOccupation',
      'fatherContactNumber',
      'residingAddressLine1',
      'residingAddressLine2',
      'residingCity',
      'residingDistrict',
      'landlineNumber',
      'secondaryContactNumber',
      'medicalConditions',
      'allergies',
    ];
    for (const field of encryptedFields) {
      const value = data[field] as string | null | undefined;
      if (value !== undefined) {
        valuesToInsert[field] = value === null ? null : sql`pgp_sym_encrypt(${value}, ${key})`;
      }
    }

    // Plain (unencrypted) fields - not identity/contact secrets, and
    // dateOfBirth/maritalStatus need to be queryable (age calc, Tab C gating).
    const plainFields: (keyof typeof data)[] = [
      'dateOfBirth',
      'spouseDateOfBirth',
      'sex',
      'maritalStatus',
      'nationality',
      'religion',
      'siblingDetails',
      'primarySchool',
      'secondarySchool',
      'gramaNiladariDivision',
      'electorate',
      'postalCode',
      'linkedinProfile',
      'additionalNotes',
      'declarationAccepted',
      'declarationAcceptedAt',
    ];
    for (const field of plainFields) {
      const value = data[field];
      if (value !== undefined) {
        valuesToInsert[field] = value;
      }
    }

    // Upsert using onConflictDoUpdate
    await executor
      .insert(employeePii)
      .values({
        ...valuesToInsert,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: employeePii.employeeId,
        set: valuesToInsert,
      });

    return this.findByEmployeeId(employeeId, executor);
  }

  static async delete(employeeId: string): Promise<void> {
    await db.delete(employeePii).where(eq(employeePii.employeeId, employeeId));
  }
}
