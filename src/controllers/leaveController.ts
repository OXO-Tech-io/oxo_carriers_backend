import { Request, Response } from 'express';
import { LeaveModel } from '../models/Leave';
import { LeaveStatus, UserRole } from '../types';
import pool from '../config/database';
import path from 'path';

export const createLeaveRequest = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { leave_type_id, start_date, end_date, reason, is_half_day, half_day_period } = req.body;

    if (!leave_type_id || !start_date || !end_date) {
      return res.status(400).json({ success: false, message: 'Required fields are missing' });
    }

    const start = new Date(start_date);
    const end = new Date(end_date);
    
    // Validate half-day request
    const isHalfDay = is_half_day === true || is_half_day === 'true';
    const halfDayPeriod = half_day_period === 'morning' || half_day_period === 'evening' ? half_day_period : undefined;
    
    // Half-day can only be applied when start_date and end_date are the same
    if (isHalfDay && start_date !== end_date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Half-day leave can only be applied when start date and end date are the same' 
      });
    }
    
    if (isHalfDay && !halfDayPeriod) {
      return res.status(400).json({ 
        success: false, 
        message: 'Half-day period (morning or evening) is required for half-day leave' 
      });
    }

    // Calculate total days
    let totalDays: number;
    if (isHalfDay) {
      totalDays = 0.5;
    } else {
      totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }

    if (totalDays <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid date range' });
    }

    // Check leave balance
    const balances = await LeaveModel.getLeaveBalance(userId);
    const balance = balances.find(b => b.leave_type_id === parseInt(leave_type_id));
    
    if (!balance) {
      return res.status(400).json({ 
        success: false, 
        message: 'Leave balance not found for this leave type',
        available_days: 0,
        requested_days: totalDays
      });
    }
    
    if (balance.remaining_days < totalDays) {
      return res.status(400).json({ 
        success: false, 
        message: `Insufficient leave balance. Available: ${balance.remaining_days} days, Requested: ${totalDays} days`,
        available_days: balance.remaining_days,
        requested_days: totalDays
      });
    }

    // Handle file upload
    let attachmentUrl: string | null = null;
    if ((req as any).file) {
      attachmentUrl = `/uploads/documents/${(req as any).file.filename}`;
    }

    const request = await LeaveModel.createRequest({
      user_id: userId,
      leave_type_id: parseInt(leave_type_id),
      start_date: start,
      end_date: end,
      total_days: totalDays,
      is_half_day: isHalfDay,
      half_day_period: halfDayPeriod,
      reason,
      attachment_url: attachmentUrl as string | undefined
    });

    res.status(201).json({ success: true, message: 'Leave request created', request });
  } catch (error: any) {
    console.error('Create leave request error:', error);
    res.status(500).json({ success: false, message: 'Failed to create leave request', error: error.message });
  }
};

export const getLeaveRequests = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const role = (req as any).user?.role;
    
    const { status, department, year } = req.query;
    const statusStr = Array.isArray(status) ? status[0] : status;
    const departmentStr = Array.isArray(department) ? department[0] : department;
    const yearStr = Array.isArray(year) ? year[0] : year;

    let requests;
    if (role === UserRole.EMPLOYEE) {
      // Employees can only see their own requests
      requests = await LeaveModel.findByUserId(userId!, {
        status: statusStr as LeaveStatus,
        year: yearStr ? parseInt(yearStr as string) : undefined
      });
    } else {
      // HR can see all requests
      requests = await LeaveModel.getAll({
        status: statusStr as LeaveStatus,
        department: departmentStr as string,
        year: yearStr ? parseInt(yearStr as string) : undefined
      });
    }

    res.json({ success: true, requests });
  } catch (error: any) {
    console.error('Get leave requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leave requests', error: error.message });
  }
};

export const getLeaveRequestById = async (req: Request, res: Response) => {
  try {
    const { id: idParam } = req.params;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const userId = (req as any).user?.userId;
    const role = (req as any).user?.role;

    const request = await LeaveModel.findById(parseInt(id as string));
    if (!request) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    // Employees can only view their own requests
    if (role === UserRole.EMPLOYEE && request.user_id !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, request });
  } catch (error: any) {
    console.error('Get leave request error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leave request', error: error.message });
  }
};

export const approveLeaveRequest = async (req: Request, res: Response) => {
  try {
    const { id: idParam } = req.params;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const { approvedBy, rejectionReason } = req.body;
    const role = (req as any).user?.role;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const request = await LeaveModel.findById(parseInt(id));
    if (!request) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    let newStatus: LeaveStatus;
    let approver: 'team_leader' | 'hr';

    if (approvedBy === 'team_leader') {
      // Check if user is the team leader (manager) of the requester
      const [requesterRows] = await pool.execute('SELECT manager_id FROM users WHERE id = ?', [request.user_id]);
      const requesterData = requesterRows as any[];
      if (!requesterData[0] || requesterData[0].manager_id !== userId) {
        return res.status(403).json({ success: false, message: 'Only the team leader can approve this request' });
      }
      
      if (request.status !== LeaveStatus.PENDING) {
        return res.status(400).json({ success: false, message: 'Invalid request status for team leader approval' });
      }
      newStatus = LeaveStatus.TEAM_LEADER_APPROVED;
      approver = 'team_leader';
    } else if (approvedBy === 'hr') {
      if (role !== UserRole.HR_MANAGER && role !== UserRole.HR_EXECUTIVE) {
        return res.status(403).json({ success: false, message: 'Only HR can approve' });
      }
      
      if (request.status === LeaveStatus.PENDING) {
        // HR can approve directly if no team leader approval needed
        newStatus = LeaveStatus.HR_APPROVED;
      } else if (request.status === LeaveStatus.TEAM_LEADER_APPROVED) {
        newStatus = LeaveStatus.HR_APPROVED;
      } else {
        return res.status(400).json({ success: false, message: 'Invalid request status for HR approval' });
      }
      approver = 'hr';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid approver' });
    }

    const updated = await LeaveModel.updateStatus(parseInt(id as string), newStatus, approver, rejectionReason);

    res.json({ success: true, message: 'Leave request updated', request: updated });
  } catch (error: any) {
    console.error('Approve leave request error:', error);
    res.status(500).json({ success: false, message: 'Failed to update leave request', error: error.message });
  }
};

export const rejectLeaveRequest = async (req: Request, res: Response) => {
  try {
    const { id: idParam } = req.params;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const { rejectionReason } = req.body;
    const role = (req as any).user?.role;

    const request = await LeaveModel.findById(parseInt(id));
    if (!request) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    // Only HR can reject
    if (role !== UserRole.HR_MANAGER && role !== UserRole.HR_EXECUTIVE) {
      return res.status(403).json({ success: false, message: 'Only HR can reject leave requests' });
    }

    if (!rejectionReason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    const updated = await LeaveModel.updateStatus(parseInt(id as string), LeaveStatus.REJECTED, 'hr', rejectionReason);

    res.json({ success: true, message: 'Leave request rejected', request: updated });
  } catch (error: any) {
    console.error('Reject leave request error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject leave request', error: error.message });
  }
};

export const getLeaveBalance = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { year: yearQuery } = req.query;

    const yearStr = Array.isArray(yearQuery) ? yearQuery[0] : yearQuery;
    const balances = await LeaveModel.getLeaveBalance(
      userId!,
      yearStr ? parseInt(yearStr as string) : undefined
    );

    res.json({ success: true, balances });
  } catch (error: any) {
    console.error('Get leave balance error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leave balance', error: error.message });
  }
};

export const getLeaveTypes = async (req: Request, res: Response) => {
  try {
    const types = await LeaveModel.getLeaveTypes();
    res.json({ success: true, types });
  } catch (error: any) {
    console.error('Get leave types error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leave types', error: error.message });
  }
};
