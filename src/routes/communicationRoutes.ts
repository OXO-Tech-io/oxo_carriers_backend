import { Router } from 'express';
import * as communicationController from '../controllers/communicationController';
import { authenticate, requireHR, requireHRManager, requireSuperAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { uploadCommunicationAttachments } from '../middleware/upload';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createCommunicationSchema,
  respondCommunicationSchema,
  communicationIdParamSchema,
} from '../validators/communication.validator';

const router = Router();

router.use(authenticate);

router.get('/mine', asyncHandler(communicationController.listMine));
router.post(
  '/:id/respond',
  validate(communicationIdParamSchema, 'params'),
  validate(respondCommunicationSchema, 'body'),
  asyncHandler(communicationController.respond)
);

router.get('/', requireHR, asyncHandler(communicationController.listAll));
router.post(
  '/',
  requireHR,
  uploadCommunicationAttachments,
  validate(createCommunicationSchema, 'body'),
  asyncHandler(communicationController.create)
);
router.get('/report', requireHRManager, asyncHandler(communicationController.report));
router.delete(
  '/:id',
  requireSuperAdmin,
  validate(communicationIdParamSchema, 'params'),
  asyncHandler(communicationController.deleteCommunication)
);

export default router;
