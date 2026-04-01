import { Request, Response } from 'express';
import { VendorModel } from '../models/Vendor';
import { UserRole } from '../types';

const canCreateVendor = [UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE, UserRole.FINANCE_MANAGER, UserRole.FINANCE_EXECUTIVE];

/** POST /vendors - create vendor (no email verification) */
export const createVendor = async (req: Request, res: Response) => {
  try {
    if (!req.user?.role || !canCreateVendor.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only HR or Finance can create vendors' });
    }
    const { email, company_name, contact_number, bank_name, account_holder_name, account_number, bank_branch } = req.body;
    const companyName = (company_name || 'Vendor').trim();
    if (!email || !companyName) {
      return res.status(400).json({ success: false, message: 'Email and company name are required' });
    }
    const existing = await VendorModel.findByEmail(email);
    if (existing) {
      return res.status(400).json({ success: false, message: 'A vendor with this email already exists' });
    }
    const vendor = await VendorModel.create({
      email,
      company_name: companyName,
      contact_number: contact_number || null,
      bank_name: bank_name || null,
      account_holder_name: account_holder_name || null,
      account_number: account_number || null,
      bank_branch: bank_branch || null,
    });
    res.status(201).json({ success: true, message: 'Vendor created successfully.', vendor });
  } catch (error: any) {
    console.error('Create vendor error:', error);
    res.status(500).json({ success: false, message: 'Failed to create vendor', error: error.message });
  }
};

/** GET /vendors - list vendors (for Finance/HR) */
export const getAllVendors = async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const vendors = await VendorModel.getAll({ search: search || undefined });
    res.json({ success: true, vendors });
  } catch (error: any) {
    console.error('Get vendors error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch vendors', error: error.message });
  }
};

/** GET /vendors/:id - get one vendor */
export const getVendorById = async (req: Request, res: Response) => {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(idParam ?? '', 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid vendor id' });
    const vendor = await VendorModel.findById(id);
    if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });
    res.json({ success: true, vendor });
  } catch (error: any) {
    console.error('Get vendor error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch vendor', error: error.message });
  }
};
