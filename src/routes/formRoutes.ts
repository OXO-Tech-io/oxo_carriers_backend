import { Router } from 'express';
import * as formController from '../controllers/formController';
import { authenticate, requireHR } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { uploadFormResponseFiles } from '../middleware/upload';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createFormSchema,
  updateFormSchema,
  distributeFormSchema,
  submitFormResponseSchema,
  formIdParamSchema,
  idParamSchema,
  createSectionSchema,
  updateSectionSchema,
  reorderSectionsSchema,
  createQuestionSchema,
  updateQuestionSchema,
  reorderQuestionsSchema,
  createLogicRuleSchema,
  updateLogicRuleSchema,
  updateFormSettingsSchema,
  updateFormThemeSchema,
  exportResponsesQuerySchema,
} from '../validators/form.validator';

const router = Router();

router.use(authenticate);

// Employee-facing: forms assigned to me + submission.
router.get('/mine', asyncHandler(formController.listAssignedToMe));
router.get('/:id', validate(formIdParamSchema, 'params'), asyncHandler(formController.getById));
router.get('/:id/my-response', validate(formIdParamSchema, 'params'), asyncHandler(formController.getMyResponse));
router.post(
  '/:id/responses',
  uploadFormResponseFiles,
  validate(formIdParamSchema, 'params'),
  validate(submitFormResponseSchema, 'body'),
  asyncHandler(formController.submitResponse)
);

// HR-facing: create/edit/build/distribute/view responses. "Only HR Team should be
// able to view form responses" per the requirements doc - requireHR covers both
// hr_executive and hr_manager, with no further manager-only restriction.
router.use(requireHR);
router.get('/', asyncHandler(formController.list));
router.post('/', validate(createFormSchema, 'body'), asyncHandler(formController.create));
router.put('/:id', validate(formIdParamSchema, 'params'), validate(updateFormSchema, 'body'), asyncHandler(formController.update));
router.delete('/:id', validate(formIdParamSchema, 'params'), asyncHandler(formController.remove));
router.post('/:id/duplicate', validate(formIdParamSchema, 'params'), asyncHandler(formController.duplicate));

// ── Sections ─────────────────────────────────────────────────────────────
router.post(
  '/:id/sections',
  validate(formIdParamSchema, 'params'),
  validate(createSectionSchema, 'body'),
  asyncHandler(formController.createSection)
);
router.put(
  '/sections/:id',
  validate(idParamSchema, 'params'),
  validate(updateSectionSchema, 'body'),
  asyncHandler(formController.updateSection)
);
router.delete('/sections/:id', validate(idParamSchema, 'params'), asyncHandler(formController.deleteSection));
router.post(
  '/:id/sections/reorder',
  validate(formIdParamSchema, 'params'),
  validate(reorderSectionsSchema, 'body'),
  asyncHandler(formController.reorderSections)
);

// ── Questions ────────────────────────────────────────────────────────────
router.post(
  '/:id/questions',
  validate(formIdParamSchema, 'params'),
  validate(createQuestionSchema, 'body'),
  asyncHandler(formController.createQuestion)
);
router.put(
  '/questions/:id',
  validate(idParamSchema, 'params'),
  validate(updateQuestionSchema, 'body'),
  asyncHandler(formController.updateQuestion)
);
router.delete('/questions/:id', validate(idParamSchema, 'params'), asyncHandler(formController.deleteQuestion));
router.post(
  '/:id/questions/reorder',
  validate(formIdParamSchema, 'params'),
  validate(reorderQuestionsSchema, 'body'),
  asyncHandler(formController.reorderQuestions)
);

// ── Logic rules ──────────────────────────────────────────────────────────
router.post(
  '/:id/logic-rules',
  validate(formIdParamSchema, 'params'),
  validate(createLogicRuleSchema, 'body'),
  asyncHandler(formController.createLogicRule)
);
router.put(
  '/logic-rules/:id',
  validate(idParamSchema, 'params'),
  validate(updateLogicRuleSchema, 'body'),
  asyncHandler(formController.updateLogicRule)
);
router.delete('/logic-rules/:id', validate(idParamSchema, 'params'), asyncHandler(formController.deleteLogicRule));

// ── Settings & theme ─────────────────────────────────────────────────────
router.get('/:id/settings', validate(formIdParamSchema, 'params'), asyncHandler(formController.getSettings));
router.put(
  '/:id/settings',
  validate(formIdParamSchema, 'params'),
  validate(updateFormSettingsSchema, 'body'),
  asyncHandler(formController.updateSettings)
);
router.get('/:id/theme', validate(formIdParamSchema, 'params'), asyncHandler(formController.getTheme));
router.put(
  '/:id/theme',
  validate(formIdParamSchema, 'params'),
  validate(updateFormThemeSchema, 'body'),
  asyncHandler(formController.updateTheme)
);

// ── Lifecycle ────────────────────────────────────────────────────────────
router.post('/:id/publish', validate(formIdParamSchema, 'params'), asyncHandler(formController.publish));
router.post('/:id/unpublish', validate(formIdParamSchema, 'params'), asyncHandler(formController.unpublish));
router.post('/:id/archive', validate(formIdParamSchema, 'params'), asyncHandler(formController.archive));
router.post(
  '/:id/distribute',
  validate(formIdParamSchema, 'params'),
  validate(distributeFormSchema, 'body'),
  asyncHandler(formController.distribute)
);

// ── Responses & analytics ────────────────────────────────────────────────
router.get('/:id/responses', validate(formIdParamSchema, 'params'), asyncHandler(formController.listResponses));
router.get(
  '/:id/responses/export',
  validate(formIdParamSchema, 'params'),
  validate(exportResponsesQuerySchema, 'query'),
  asyncHandler(formController.exportResponses)
);
router.get('/:id/analytics', validate(formIdParamSchema, 'params'), asyncHandler(formController.getAnalytics));

export default router;
