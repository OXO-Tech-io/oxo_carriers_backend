import { Router } from 'express';
import * as workLogController from '../controllers/workLogController';
import { authenticate, requireHRManager } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { uploadExcel } from '../middleware/upload';
import { asyncHandler } from '../utils/asyncHandler';
import { submitWorkLogsSchema, listWorkLogsQuerySchema } from '../validators/workLog.validator';

const router = Router();

router.use(authenticate);

router.get('/template', asyncHandler(workLogController.downloadTemplate));
router.get('/mine', validate(listWorkLogsQuerySchema, 'query'), asyncHandler(workLogController.listMine));
router.get('/', requireHRManager, validate(listWorkLogsQuerySchema, 'query'), asyncHandler(workLogController.listAll));
router.get('/summary', requireHRManager, validate(listWorkLogsQuerySchema, 'query'), asyncHandler(workLogController.getSummary));
router.get('/reports/summary', requireHRManager, validate(listWorkLogsQuerySchema, 'query'), asyncHandler(workLogController.downloadSummaryReport));
router.get('/reports/detailed', requireHRManager, validate(listWorkLogsQuerySchema, 'query'), asyncHandler(workLogController.downloadDetailedReport));
router.post('/', validate(submitWorkLogsSchema, 'body'), asyncHandler(workLogController.submit));
router.post('/bulk-upload', uploadExcel, asyncHandler(workLogController.bulkUpload));

export default router;
