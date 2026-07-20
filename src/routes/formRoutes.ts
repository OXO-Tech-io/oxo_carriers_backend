import { Router } from 'express';
import * as formController from '../controllers/formController';
import { authenticate, requireHR } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { uploadFormResponseFiles } from '../middleware/upload';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createFormSchema,
  distributeFormSchema,
  submitFormResponseSchema,
  formIdParamSchema,
} from '../validators/form.validator';

const router = Router();

router.use(authenticate);

// Employee-facing: forms assigned to me + submission.
router.get('/mine', asyncHandler(formController.listAssignedToMe));
router.get('/:id', validate(formIdParamSchema, 'params'), asyncHandler(formController.getById));
router.post(
  '/:id/responses',
  uploadFormResponseFiles,
  validate(formIdParamSchema, 'params'),
  validate(submitFormResponseSchema, 'body'),
  asyncHandler(formController.submitResponse)
);

// HR-facing: create/distribute/view responses. "Only HR Team should be able
// to view form responses" per the requirements doc - requireHR covers both
// hr_executive and hr_manager, with no further manager-only restriction.
router.use(requireHR);
router.get('/', asyncHandler(formController.list));
router.post('/', validate(createFormSchema, 'body'), asyncHandler(formController.create));
router.post('/:id/publish', validate(formIdParamSchema, 'params'), asyncHandler(formController.publish));
router.post(
  '/:id/distribute',
  validate(formIdParamSchema, 'params'),
  validate(distributeFormSchema, 'body'),
  asyncHandler(formController.distribute)
);
router.get('/:id/responses', validate(formIdParamSchema, 'params'), asyncHandler(formController.listResponses));
router.get('/:id/responses/export', validate(formIdParamSchema, 'params'), asyncHandler(formController.exportResponses));

export default router;
