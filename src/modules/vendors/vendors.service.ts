import { BadRequestException, Injectable } from '@nestjs/common';
import { VendorModel } from '../../models/Vendor';
import { CreateVendorDto } from './dto/create-vendor.dto';

@Injectable()
export class VendorsService {
  async create(dto: CreateVendorDto) {
    const companyName = (dto.company_name || 'Vendor').trim();
    if (!dto.email || !companyName) {
      throw new BadRequestException('Email and company name are required');
    }
    const existing = await VendorModel.findByEmail(dto.email);
    if (existing) {
      // Matches the original controller's status code (400, not 409).
      throw new BadRequestException('A vendor with this email already exists');
    }
    return VendorModel.create({
      email: dto.email,
      company_name: companyName,
      contact_number: dto.contact_number || null,
      bank_name: dto.bank_name || null,
      account_holder_name: dto.account_holder_name || null,
      account_number: dto.account_number || null,
      bank_branch: dto.bank_branch || null,
    });
  }

  getAll(search?: string) {
    return VendorModel.getAll({ search: search || undefined });
  }

  findById(id: number) {
    return VendorModel.findById(id);
  }
}
