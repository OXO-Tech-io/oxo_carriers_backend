import { Request, Response, NextFunction } from "express";
import { JwtPayload, UserRole } from "../types";
import { UserModel } from "../models/User";
import { verifyKeycloakToken } from "./keycloakAuth";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      file?: Express.Multer.File;
    }
  }
}

const ROLE_PRIORITY: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.HR_MANAGER,
  UserRole.HR_EXECUTIVE,
  UserRole.FINANCE_MANAGER,
  UserRole.FINANCE_EXECUTIVE,
  UserRole.EMPLOYEE,
  UserRole.CONSULTANT,
  UserRole.SERVICE_PROVIDER,
];

const extractAllKeycloakRoles = (claims: {
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
}): string[] => {
  const roleSet = new Set<string>();

  claims.realm_access?.roles?.forEach((role) => roleSet.add(role));

  Object.values(claims.resource_access ?? {}).forEach((resource) => {
    resource.roles?.forEach((role) => roleSet.add(role));
  });

  return [...roleSet];
};

const mapKeycloakRoles = (roles: string[] | undefined): UserRole => {
  if (!roles || roles.length === 0) return UserRole.EMPLOYEE;
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return UserRole.EMPLOYEE;
};

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ success: false, message: "No token provided" });
      return;
    }

    const token = authHeader.substring(7);
    const { claims } = await verifyKeycloakToken(token);

    if (!claims.email) {
      res
        .status(401)
        .json({ success: false, message: "Token missing email claim" });
      return;
    }

    const role = mapKeycloakRoles(extractAllKeycloakRoles(claims));
    const user = await UserModel.findOrCreateFromKeycloak({
      sub: claims.sub,
      email: claims.email,
      first_name: claims.given_name || claims.preferred_username || "",
      last_name: claims.family_name || "",
      role,
    });

    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
      sub: claims.sub,
    };
    next();
  } catch (err) {
    console.warn(
      "[Auth] ❌ Token verification failed:",
      (err as Error).message,
    );
    res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
};

/**
 * Generic role-based authorization.
 * Super admins always pass regardless of the roles list.
 */
export const authorize = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    if (req.user.role === UserRole.SUPER_ADMIN) {
      next();
      return;
    }
    if (!roles.includes(req.user.role)) {
      res
        .status(403)
        .json({
          success: false,
          message: "Forbidden: Insufficient permissions",
        });
      return;
    }
    next();
  };
};

export const requireSuperAdmin = authorize(UserRole.SUPER_ADMIN);
export const requireHRManager = authorize(UserRole.HR_MANAGER);
export const requireHRExecutive = authorize(UserRole.HR_EXECUTIVE);
export const requireHR = authorize(UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE);
export const requireHROrFinance = authorize(
  UserRole.HR_MANAGER,
  UserRole.HR_EXECUTIVE,
  UserRole.FINANCE_MANAGER,
  UserRole.FINANCE_EXECUTIVE,
);

export const isSuperAdmin = (req: Request): boolean =>
  req.user?.role === UserRole.SUPER_ADMIN;
