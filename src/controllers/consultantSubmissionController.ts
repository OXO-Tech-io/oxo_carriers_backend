import { Request, Response } from 'express';
import { ConsultantWorkSubmissionModel } from '../models/ConsultantWorkSubmission';
import { ConsultantSubmissionStatus, UserRole } from '../types';
import { logger } from '../lib/logger';

const log = (req: Request) => req.log ?? logger;

// Required-field presence (project/tech/total_hours) and employeeId are
// enforced by requireEmployeeId/validateRequiredFields middleware (see routes).
export const submit = async (req: Request, res: Response) => {
  try {
    const employeeId = (req as any).employee?.employeeId;
    const role = (req as any).employee?.role;
    if (role !== UserRole.CONSULTANT) {
      return res.status(403).json({ success: false, message: 'Only consultants can submit work' });
    }

    const { project, tech, total_hours, comment } = req.body;
    if (isNaN(parseFloat(total_hours))) {
      return res.status(400).json({ success: false, message: 'Total hours must be a number' });
    }
    const hours = parseFloat(total_hours);
    if (hours <= 0) return res.status(400).json({ success: false, message: 'Total hours must be greater than 0' });

    const file = (req as any).file;
    if (!file) return res.status(400).json({ success: false, message: 'Log sheet (Excel) is required' });
    const log_sheet_url = `/uploads/documents/${file.filename}`;

    const submission = await ConsultantWorkSubmissionModel.create({
      employee_id: employeeId,
      project: project.trim(),
      tech: tech.trim(),
      total_hours: hours,
      comment: comment?.trim() || null,
      log_sheet_url
    });

    res.status(201).json({ success: true, message: 'Work submission created', submission });
  } catch (error: any) {
    log(req).error({ err: error }, 'Consultant submit failed');
    res.status(500).json({ success: false, message: 'Failed to submit work', error: error.message });
  }
};

export const getMySubmissions = async (req: Request, res: Response) => {
  try {
    const employeeId = (req as any).employee?.employeeId;
    if (!employeeId) return res.status(400).json({ success: false, message: 'Employee ID not found on this account' });
    const status = req.query.status as ConsultantSubmissionStatus | undefined;
    const submissions = await ConsultantWorkSubmissionModel.findByEmployeeId(employeeId, { status });
    res.json({ success: true, submissions });
  } catch (error: any) {
    log(req).error({ err: error }, 'Get my consultant submissions failed');
    res.status(500).json({ success: false, message: 'Failed to fetch submissions', error: error.message });
  }
};

export const getAll = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as ConsultantSubmissionStatus | undefined;
    const submissions = await ConsultantWorkSubmissionModel.getAll({ status });
    res.json({ success: true, submissions });
  } catch (error: any) {
    log(req).error({ err: error }, 'Get all consultant submissions failed');
    res.status(500).json({ success: false, message: 'Failed to fetch submissions', error: error.message });
  }
};

// Single list endpoint - branches on role so the frontend only calls one route
export const getSubmissions = async (req: Request, res: Response) => {
  const role = (req as any).employee?.role;
  if (role === UserRole.HR_MANAGER || role === UserRole.HR_EXECUTIVE) {
    return getAll(req, res);
  }
  return getMySubmissions(req, res);
};

export const getSubmissionById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const employeeId = (req as any).employee?.employeeId;
    const role = (req as any).employee?.role;

    const submission = await ConsultantWorkSubmissionModel.findById(id);
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });

    if (role !== UserRole.HR_MANAGER && role !== UserRole.HR_EXECUTIVE && submission.employee_id !== employeeId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, submission });
  } catch (error: any) {
    log(req).error({ err: error }, 'Get consultant submission failed');
    res.status(500).json({ success: false, message: 'Failed to fetch submission', error: error.message });
  }
};

// Single decision endpoint - approve or reject, chosen via body.action
export const decideSubmission = async (req: Request, res: Response) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { action, admin_comment } = req.body;
    const role = (req as any).employee?.role;
    const userId = (req as any).employee?.userId;

    if (role !== UserRole.HR_MANAGER && role !== UserRole.HR_EXECUTIVE) {
      return res.status(403).json({ success: false, message: 'Only HR can review consultant submissions' });
    }

    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ success: false, message: "action must be 'approve' or 'reject'" });
    }

    if (action === 'reject' && (!admin_comment || typeof admin_comment !== 'string' || !admin_comment.trim())) {
      return res.status(400).json({ success: false, message: 'Admin comment is required for rejection' });
    }

    const existing = await ConsultantWorkSubmissionModel.findById(id);
    if (!existing) return res.status(404).json({ success: false, message: 'Submission not found' });

    const newStatus = action === 'approve' ? ConsultantSubmissionStatus.APPROVED : ConsultantSubmissionStatus.REJECTED;

    let updated;
    try {
      updated = await ConsultantWorkSubmissionModel.updateStatusTransactional(
        id,
        ConsultantSubmissionStatus.PENDING,
        newStatus,
        userId!,
        action === 'reject' ? admin_comment.trim() : null
      );
    } catch (err: any) {
      if (err.message === 'SUBMISSION_NOT_PENDING') {
        return res.status(400).json({ success: false, message: 'Submission is not pending' });
      }
      throw err;
    }

    if (!updated) return res.status(404).json({ success: false, message: 'Submission not found' });

    res.json({
      success: true,
      message: action === 'approve' ? 'Submission approved' : 'Submission rejected',
      submission: updated
    });
  } catch (error: any) {
    log(req).error({ err: error }, 'Review consultant submission failed');
    res.status(500).json({ success: false, message: 'Failed to review submission', error: error.message });
  }
};

export const resubmit = async (req: Request, res: Response) => {
  try {
    const employeeId = (req as any).employee?.employeeId;
    const role = (req as any).employee?.role;
    if (role !== UserRole.CONSULTANT) {
      return res.status(403).json({ success: false, message: 'Only consultants can resubmit' });
    }

    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { project, tech, total_hours, comment } = req.body;
    const original = await ConsultantWorkSubmissionModel.findById(id);
    if (!original) return res.status(404).json({ success: false, message: 'Original submission not found' });
    if (original.employee_id !== employeeId) return res.status(403).json({ success: false, message: 'Forbidden' });
    if (original.status !== ConsultantSubmissionStatus.REJECTED) {
      return res.status(400).json({ success: false, message: 'Only rejected submissions can be resubmitted' });
    }

    const projectVal = project?.trim() || original.project;
    const techVal = tech?.trim() || original.tech;
    const hoursVal = total_hours != null && !isNaN(parseFloat(total_hours)) ? parseFloat(total_hours) : original.total_hours;
    if (hoursVal <= 0) return res.status(400).json({ success: false, message: 'Total hours must be greater than 0' });

    const file = (req as any).file;
    if (!file) return res.status(400).json({ success: false, message: 'Log sheet (Excel) is required for resubmission' });
    const log_sheet_url = `/uploads/documents/${file.filename}`;

    const submission = await ConsultantWorkSubmissionModel.create({
      employee_id: employeeId,
      project: projectVal,
      tech: techVal,
      total_hours: hoursVal,
      comment: comment?.trim() || original.comment,
      log_sheet_url,
      resubmission_of: id
    });

    res.status(201).json({ success: true, message: 'Work resubmitted', submission });
  } catch (error: any) {
    log(req).error({ err: error }, 'Consultant resubmit failed');
    res.status(500).json({ success: false, message: 'Failed to resubmit', error: error.message });
  }
};
