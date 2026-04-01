import { Request, Response } from 'express';
import { ConsultantWorkSubmissionModel } from '../models/ConsultantWorkSubmission';
import { ConsultantSubmissionStatus, UserRole } from '../types';

export const submit = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const role = (req as any).user?.role;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (role !== UserRole.CONSULTANT) {
      return res.status(403).json({ success: false, message: 'Only consultants can submit work' });
    }

    const { project, tech, total_hours, comment } = req.body;
    if (!project?.trim() || !tech?.trim() || total_hours == null || isNaN(parseFloat(total_hours))) {
      return res.status(400).json({ success: false, message: 'Project, tech, and total hours are required' });
    }
    const hours = parseFloat(total_hours);
    if (hours <= 0) return res.status(400).json({ success: false, message: 'Total hours must be greater than 0' });

    const file = (req as any).file;
    if (!file) return res.status(400).json({ success: false, message: 'Log sheet (Excel) is required' });
    const log_sheet_url = `/uploads/documents/${file.filename}`;

    const submission = await ConsultantWorkSubmissionModel.create({
      user_id: userId,
      project: project.trim(),
      tech: tech.trim(),
      total_hours: hours,
      comment: comment?.trim() || null,
      log_sheet_url
    });

    res.status(201).json({ success: true, message: 'Work submission created', submission });
  } catch (error: any) {
    console.error('Consultant submit error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit work', error: error.message });
  }
};

export const getMySubmissions = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const status = req.query.status as ConsultantSubmissionStatus | undefined;
    const submissions = await ConsultantWorkSubmissionModel.findByUserId(userId, { status });
    res.json({ success: true, submissions });
  } catch (error: any) {
    console.error('Get my consultant submissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch submissions', error: error.message });
  }
};

export const getAll = async (req: Request, res: Response) => {
  try {
    const status = req.query.status as ConsultantSubmissionStatus | undefined;
    const submissions = await ConsultantWorkSubmissionModel.getAll({ status });
    res.json({ success: true, submissions });
  } catch (error: any) {
    console.error('Get all consultant submissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch submissions', error: error.message });
  }
};

export const getSubmissions = async (req: Request, res: Response) => {
  const role = (req as any).user?.role;
  if (role === UserRole.HR_MANAGER || role === UserRole.HR_EXECUTIVE) {
    return getAll(req, res);
  }
  return getMySubmissions(req, res);
};

export const getById = async (req: Request, res: Response) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const userId = (req as any).user?.userId;
    const role = (req as any).user?.role;

    const submission = await ConsultantWorkSubmissionModel.findById(id);
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });

    if (role !== UserRole.HR_MANAGER && role !== UserRole.HR_EXECUTIVE && submission.user_id !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, submission });
  } catch (error: any) {
    console.error('Get consultant submission error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch submission', error: error.message });
  }
};

export const approve = async (req: Request, res: Response) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const role = (req as any).user?.role;
    const userId = (req as any).user?.userId;

    if (role !== UserRole.HR_MANAGER && role !== UserRole.HR_EXECUTIVE) {
      return res.status(403).json({ success: false, message: 'Only HR can approve consultant submissions' });
    }

    const submission = await ConsultantWorkSubmissionModel.findById(id);
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });
    if (submission.status !== ConsultantSubmissionStatus.PENDING) {
      return res.status(400).json({ success: false, message: 'Submission is not pending' });
    }

    const updated = await ConsultantWorkSubmissionModel.updateStatus(id, ConsultantSubmissionStatus.APPROVED, userId!, null);
    res.json({ success: true, message: 'Submission approved', submission: updated });
  } catch (error: any) {
    console.error('Approve consultant submission error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve', error: error.message });
  }
};

export const reject = async (req: Request, res: Response) => {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { admin_comment } = req.body;
    const role = (req as any).user?.role;
    const userId = (req as any).user?.userId;

    if (role !== UserRole.HR_MANAGER && role !== UserRole.HR_EXECUTIVE) {
      return res.status(403).json({ success: false, message: 'Only HR can reject consultant submissions' });
    }

    const submission = await ConsultantWorkSubmissionModel.findById(id);
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });
    if (submission.status !== ConsultantSubmissionStatus.PENDING) {
      return res.status(400).json({ success: false, message: 'Submission is not pending' });
    }

    if (!admin_comment || typeof admin_comment !== 'string' || !admin_comment.trim()) {
      return res.status(400).json({ success: false, message: 'Admin comment is required for rejection' });
    }

    const updated = await ConsultantWorkSubmissionModel.updateStatus(id, ConsultantSubmissionStatus.REJECTED, userId!, admin_comment.trim());
    res.json({ success: true, message: 'Submission rejected', submission: updated });
  } catch (error: any) {
    console.error('Reject consultant submission error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject', error: error.message });
  }
};

export const resubmit = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const role = (req as any).user?.role;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (role !== UserRole.CONSULTANT) {
      return res.status(403).json({ success: false, message: 'Only consultants can resubmit' });
    }

    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const { project, tech, total_hours, comment } = req.body;
    const original = await ConsultantWorkSubmissionModel.findById(id);
    if (!original) return res.status(404).json({ success: false, message: 'Original submission not found' });
    if (original.user_id !== userId) return res.status(403).json({ success: false, message: 'Forbidden' });
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
      user_id: userId,
      project: projectVal,
      tech: techVal,
      total_hours: hoursVal,
      comment: comment?.trim() || original.comment,
      log_sheet_url,
      resubmission_of: id
    });

    res.status(201).json({ success: true, message: 'Work resubmitted', submission });
  } catch (error: any) {
    console.error('Consultant resubmit error:', error);
    res.status(500).json({ success: false, message: 'Failed to resubmit', error: error.message });
  }
};
