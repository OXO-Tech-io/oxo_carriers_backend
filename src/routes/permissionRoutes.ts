import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth";
import { PERMISSIONS } from "../constants/permissions";
import { hasPermission } from "../middleware/permissions";
import * as permissionController from "../controllers/permissionController";

const router = Router();

const requirePermissionsRead = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.user?.userId;
  const role = req.user?.role;

  if (!userId || !role) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  if (role === "super_admin") {
    return next();
  }

  const allowed = await hasPermission(userId, PERMISSIONS.PERMISSIONS, "read");
  if (!allowed) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  return next();
};

const requirePermissionsWrite = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = req.user?.userId;
  const role = req.user?.role;

  if (!userId || !role) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  if (role === "super_admin") {
    return next();
  }

  const allowed = await hasPermission(userId, PERMISSIONS.PERMISSIONS, "write");
  if (!allowed) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  return next();
};

router.use(authenticate);

router.get("/catalog", permissionController.getPermissionCatalog);
router.get("/me", permissionController.getMyPermissions);
router.get(
  "/manage-users",
  requirePermissionsRead,
  permissionController.getManageableUsers,
);

router.get(
  "/users",
  requirePermissionsRead,
  permissionController.getAllUserPermissions,
);
router.get(
  "/users/:id",
  requirePermissionsRead,
  permissionController.getUserPermissions,
);
router.put(
  "/users/:id",
  requirePermissionsWrite,
  permissionController.replaceUserPermissions,
);

export default router;
