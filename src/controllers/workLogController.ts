import { Request, Response } from 'express';
import { workLogService } from '../services/workLog.service';
import { UnauthorizedError, BadRequestError } from '../utils/AppError';
import { ok, created } from '../utils/response';
import { SubmitWorkLogsInput, ListWorkLogsQuery } from '../validators/workLog.validator';

export const submit = async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const { entries } = req.body as SubmitWorkLogsInput;
  const result = await workLogService.submitEntries(req.user.userId, entries);
  created(res, result, 'Work log entries submitted');
};

export const listMine = async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const { from, to } = req.query as unknown as ListWorkLogsQuery;
  const logs = await workLogService.listMine(req.user.userId, { from, to });
  ok(res, logs, 'Work logs fetched');
};

export const listAll = async (req: Request, res: Response) => {
  const { userId, from, to } = req.query as unknown as ListWorkLogsQuery;
  const logs = await workLogService.listAll({ userId, from, to });
  ok(res, logs, 'Work logs fetched');
};

export const getSummary = async (req: Request, res: Response) => {
  const { from, to } = req.query as unknown as ListWorkLogsQuery;
  const summary = await workLogService.getSummary({ from, to });
  ok(res, summary, 'Work log summary fetched');
};

export const downloadSummaryReport = async (req: Request, res: Response) => {
  const { from, to } = req.query as unknown as ListWorkLogsQuery;
  const buffer = await workLogService.generateSummaryReport({ from, to });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=work-logs-summary.xlsx');
  res.send(buffer);
};

export const downloadDetailedReport = async (req: Request, res: Response) => {
  const { userId, from, to } = req.query as unknown as ListWorkLogsQuery;
  const buffer = await workLogService.generateDetailedReport({ userId, from, to });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=work-logs-detailed.xlsx');
  res.send(buffer);
};

export const downloadTemplate = async (_req: Request, res: Response) => {
  const buffer = await workLogService.generateTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=work-log-template.xlsx');
  res.send(buffer);
};

export const bulkUpload = async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  if (!req.file) throw new BadRequestError('Excel file is required');
  const result = await workLogService.bulkUpload(req.user.userId, req.file.path);
  ok(res, result, 'Bulk upload processed');
};
