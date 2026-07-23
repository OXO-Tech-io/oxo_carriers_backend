import { Router, Request, Response, NextFunction } from 'express';
import * as groupController from '../controllers/groupController';
import { authenticate } from '../middleware/auth';
import { hasPermission } from '../middleware/permissions';
import { PERMISSIONS } from '../constants/permissions';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import {
  addGroupMembersSchema,
  createGroupSchema,
  groupIdParamSchema,
  groupMemberParamSchema,
  renameGroupSchema,
} from '../validators/group.validator';

const router = Router();

// Groups access is governed purely by the `groups` permission key (assigned
// per-user by Super Admin via /admin/permissions) - there is no hardcoded
// HR-role carve-out, per product decision. Super Admin always bypasses.
const requirePermissionLevel = (level: 'read' | 'write') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.employee?.userId;
    const role = req.employee?.role;
    if (!userId || !role) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (role === 'super_admin') return next();
    const allowed = await hasPermission(userId, PERMISSIONS.GROUPS, level);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    return next();
  };
};

const requireGroupsRead = requirePermissionLevel('read');
const requireGroupsWrite = requirePermissionLevel('write');

router.use(authenticate);

// Any authenticated user can list groups (read-only, id/name/memberCount) -
// needed so the Communications/Forms recipient pickers can offer groups as a
// target without every sender needing the `groups` permission themselves.
router.get('/', asyncHandler(groupController.list));
// Full member roster (names/emails) is only exposed to holders of the
// `groups` permission - the recipient pickers never need to call this.
router.get('/:id', requireGroupsRead, validate(groupIdParamSchema, 'params'), asyncHandler(groupController.getById));

router.post('/', requireGroupsWrite, validate(createGroupSchema, 'body'), asyncHandler(groupController.create));
router.patch(
  '/:id',
  requireGroupsWrite,
  validate(groupIdParamSchema, 'params'),
  validate(renameGroupSchema, 'body'),
  asyncHandler(groupController.rename)
);
router.delete('/:id', requireGroupsWrite, validate(groupIdParamSchema, 'params'), asyncHandler(groupController.remove));
router.post(
  '/:id/members',
  requireGroupsWrite,
  validate(groupIdParamSchema, 'params'),
  validate(addGroupMembersSchema, 'body'),
  asyncHandler(groupController.addMembers)
);
router.delete(
  '/:id/members/:userId',
  requireGroupsWrite,
  validate(groupMemberParamSchema, 'params'),
  asyncHandler(groupController.removeMember)
);

export default router;
