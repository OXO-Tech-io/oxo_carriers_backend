import { Router } from 'express';
import * as eventController from '../controllers/eventController';
import { authenticate, requireHR } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { createEventSchema, recordParticipationSchema, eventIdParamSchema } from '../validators/event.validator';

const router = Router();

router.use(authenticate);
router.use(requireHR);

router.get('/', asyncHandler(eventController.list));
router.post('/', validate(createEventSchema, 'body'), asyncHandler(eventController.create));
router.get('/:id', validate(eventIdParamSchema, 'params'), asyncHandler(eventController.getById));
router.post(
  '/:id/participation',
  validate(eventIdParamSchema, 'params'),
  validate(recordParticipationSchema, 'body'),
  asyncHandler(eventController.recordParticipation)
);

export default router;
