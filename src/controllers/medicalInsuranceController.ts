import { Request, Response } from 'express';
import { MedicalInsuranceModel, getCurrentQuarter, getMaxAmountForType } from '../models/MedicalInsurance';
import { MedicalClaimType, MedicalClaimStatus, UserRole } from '../types';

export const apply = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const type = req.body.type as MedicalClaimType;
    const quarter = (req.body.quarter as string) || getCurrentQuarter();
    const amount = parseFloat(req.body.amount);

    if (!type || (type !== MedicalClaimType.IN && type !== MedicalClaimType.OPD)) {
      return res.status(400).json({ success: false, message: 'Type must be IN or OPD' });
    }
    if (amount == null || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required' });
    }

    const maxAmount = getMaxAmountForType(type);
    if (amount > maxAmount) {
      return res.status(400).json({
        success: false,
        message: `${type} claim amount cannot exceed ${maxAmount.toLocaleString()}${type === 'OPD' ? ' per quarter' : ''}`
      });
    }

    if (type === MedicalClaimType.OPD) {
      const used = await MedicalInsuranceModel.getUsedOPDAmountForQuarter(userId, quarter);
      if (used + amount > maxAmount) {
        return res.status(400).json({
          success: false,
          message: `OPD quarter limit exceeded. Used: ${used.toLocaleString()}, limit: ${maxAmount.toLocaleString()} for ${quarter}`
        });
      }
    }

    const files = (req as any).files as { supportive_document?: Express.Multer.File[]; relevant_document?: Express.Multer.File[] };
    const supportiveFile = files?.supportive_document?.[0];
    if (!supportiveFile) {
      return res.status(400).json({ success: false, message: 'Supportive document is required' });
    }
    const supportive_document_url = `/uploads/documents/${supportiveFile.filename}`;
    const relevantFile = files?.relevant_document?.[0];
    const relevant_document_url = relevantFile ? `/uploads/documents/${relevantFile.filename}` : null;

    const claim = await MedicalInsuranceModel.create({
      user_id: userId,
      type,
      quarter,
      amount,
      supportive_document_url,
      relevant_document_url
    });

    res.status(201).json({ success: true, message: 'Medical insurance claim submitted', claim });
  } catch (error: any) {
    console.error('Medical insurance apply error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit claim', error: error.message });
  }
};

export const getMyClaims = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const status = req.query.status as MedicalClaimStatus | undefined;
    const claims = await MedicalInsuranceModel.findByUserId(userId, { status });
    res.json({ success: true, claims });
  } catch (error: any) {
    console.error('Get my medical claims error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch claims', error: error.message });
  }
};

export const getAll = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as MedicalClaimStatus | undefined;
    const type = req.query.type as MedicalClaimType | undefined;
    const claims = await MedicalInsuranceModel.getAll({ status, type });
    res.json({ success: true, claims });
  } catch (error: any) {
    console.error('Get all medical claims error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch claims', error: error.message });
  }
};

export const getClaims = async (req: Request, res: Response) => {
  const role = (req as any).user?.role;
  if (role === UserRole.HR_MANAGER || role === UserRole.HR_EXECUTIVE) {
    return getAll(req, res);
  }
  return getMyClaims(req, res);
};

export const getById = async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);
    const userId = (req as any).user?.userId;
    const role = (req as any).user?.role;

    const claim = await MedicalInsuranceModel.findById(id);
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }

    if (role === UserRole.EMPLOYEE && claim.user_id !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, claim });
  } catch (error: any) {
    console.error('Get medical claim error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch claim', error: error.message });
  }
};

export const approve = async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);
    const role = (req as any).user?.role;
    const userId = (req as any).user?.userId;

    if (role !== UserRole.HR_MANAGER && role !== UserRole.HR_EXECUTIVE) {
      return res.status(403).json({ success: false, message: 'Only HR can approve medical claims' });
    }

    const claim = await MedicalInsuranceModel.findById(id);
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }
    if (claim.status !== MedicalClaimStatus.PENDING) {
      return res.status(400).json({ success: false, message: 'Claim is not pending' });
    }

    const updated = await MedicalInsuranceModel.updateStatus(id, MedicalClaimStatus.APPROVED, userId!, null);
    res.json({ success: true, message: 'Claim approved', claim: updated });
  } catch (error: any) {
    console.error('Approve medical claim error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve claim', error: error.message });
  }
};

export const reject = async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);
    const { admin_comment } = req.body;
    const role = (req as any).user?.role;
    const userId = (req as any).user?.userId;

    if (role !== UserRole.HR_MANAGER && role !== UserRole.HR_EXECUTIVE) {
      return res.status(403).json({ success: false, message: 'Only HR can reject medical claims' });
    }

    const claim = await MedicalInsuranceModel.findById(id);
    if (!claim) {
      return res.status(404).json({ success: false, message: 'Claim not found' });
    }
    if (claim.status !== MedicalClaimStatus.PENDING) {
      return res.status(400).json({ success: false, message: 'Claim is not pending' });
    }

    if (!admin_comment || typeof admin_comment !== 'string' || !admin_comment.trim()) {
      return res.status(400).json({ success: false, message: 'Admin comment is required for rejection' });
    }

    const updated = await MedicalInsuranceModel.updateStatus(id, MedicalClaimStatus.REJECTED, userId!, admin_comment.trim());
    res.json({ success: true, message: 'Claim rejected', claim: updated });
  } catch (error: any) {
    console.error('Reject medical claim error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject claim', error: error.message });
  }
};

export const resubmit = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const idParam = req.params.id;
    const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam);
    const type = (req.body.type as MedicalClaimType) || undefined;
    const quarter = (req.body.quarter as string) || undefined;
    const amount = req.body.amount != null ? parseFloat(req.body.amount) : undefined;

    const original = await MedicalInsuranceModel.findById(id);
    if (!original) {
      return res.status(404).json({ success: false, message: 'Original claim not found' });
    }
    if (original.user_id !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (original.status !== MedicalClaimStatus.REJECTED) {
      return res.status(400).json({ success: false, message: 'Only rejected claims can be resubmitted' });
    }

    const finalType = type || original.type;
    const finalQuarter = quarter || original.quarter;
    const finalAmount = amount != null && !isNaN(amount) ? amount : original.amount;

    const maxAmount = getMaxAmountForType(finalType);
    if (finalAmount > maxAmount) {
      return res.status(400).json({
        success: false,
        message: `${finalType} claim amount cannot exceed ${maxAmount.toLocaleString()}${finalType === 'OPD' ? ' per quarter' : ''}`
      });
    }

    if (finalType === MedicalClaimType.OPD) {
      const used = await MedicalInsuranceModel.getUsedOPDAmountForQuarter(userId, finalQuarter);
      if (used + finalAmount > maxAmount) {
        return res.status(400).json({
          success: false,
          message: `OPD quarter limit exceeded for ${finalQuarter}`
        });
      }
    }

    const files = (req as any).files as { supportive_document?: Express.Multer.File[]; relevant_document?: Express.Multer.File[] };
    const supportiveFile = files?.supportive_document?.[0];
    if (!supportiveFile) {
      return res.status(400).json({ success: false, message: 'Supportive document is required for resubmission' });
    }
    const supportive_document_url = `/uploads/documents/${supportiveFile.filename}`;
    const relevantFile = files?.relevant_document?.[0];
    const relevant_document_url = relevantFile ? `/uploads/documents/${relevantFile.filename}` : original.relevant_document_url ?? null;

    const claim = await MedicalInsuranceModel.create({
      user_id: userId,
      type: finalType,
      quarter: finalQuarter,
      amount: finalAmount,
      supportive_document_url,
      relevant_document_url,
      resubmission_of: id
    });

    res.status(201).json({ success: true, message: 'Claim resubmitted', claim });
  } catch (error: any) {
    console.error('Resubmit medical claim error:', error);
    res.status(500).json({ success: false, message: 'Failed to resubmit claim', error: error.message });
  }
};

export const getLimits = async (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      limits: {
        IN: { maxPerClaim: 300000, description: 'In-patient up to 300,000' },
        OPD: { maxPerQuarter: 6000, yearlyTotal: 24000, description: 'Out-patient 6,000 per quarter (24,000 per year)' }
      },
      currentQuarter: getCurrentQuarter()
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to get limits', error: error.message });
  }
};
