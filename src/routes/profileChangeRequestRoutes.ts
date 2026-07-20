import { Router } from 'express';
import * as profileChangeRequestController from '../controllers/profileChangeRequestController';
import { authenticate, requireHR } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import {
  decideProfileChangeRequestSchema,
  listProfileChangeRequestsQuerySchema,
  profileChangeRequestIdParamSchema,
  submitProfileChangeRequestSchema,
} from '../validators/profileChangeRequest.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  validate(submitProfileChangeRequestSchema, 'body'),
  asyncHandler(profileChangeRequestController.submit)
);

router.get(
  '/',
  validate(listProfileChangeRequestsQuerySchema, 'query'),
  asyncHandler(profileChangeRequestController.list)
);

router.get(
  '/:id',
  validate(profileChangeRequestIdParamSchema, 'params'),
  asyncHandler(profileChangeRequestController.getById)
);

router.put(
  '/:id/decision',
  requireHR,
  validate(profileChangeRequestIdParamSchema, 'params'),
  validate(decideProfileChangeRequestSchema, 'body'),
  asyncHandler(profileChangeRequestController.decide)
);

export default router;
