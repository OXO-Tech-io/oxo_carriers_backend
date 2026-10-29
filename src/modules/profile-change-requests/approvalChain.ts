import { UserRole } from '../../types';

// OCD-603/604/605: profile changes are applied only after every stage of the
// submitter's approval chain has signed off:
//   - Employee (self-service)  -> HR Manager -> Administrator
//   - HR Executive             -> HR Manager -> Administrator
//   - HR Manager               -> Administrator
//   - Administrator            -> Administrator
export type ApprovalStage = 'hr_manager' | 'admin';

const STAGE_ROLE: Record<ApprovalStage, UserRole> = {
  hr_manager: UserRole.HR_MANAGER,
  admin: UserRole.SUPER_ADMIN,
};

/** Submitter roles whose requests skip the HR Manager stage and go straight to the Administrator. */
const ADMIN_ONLY_CHAIN_ROLES: UserRole[] = [UserRole.HR_MANAGER, UserRole.SUPER_ADMIN];

export function getApprovalChain(submitterRole: UserRole): ApprovalStage[] {
  if (ADMIN_ONLY_CHAIN_ROLES.includes(submitterRole)) return ['admin'];
  return ['hr_manager', 'admin'];
}

export function firstApprovalStage(submitterRole: UserRole): ApprovalStage {
  return getApprovalChain(submitterRole)[0];
}

/** The stage that follows `stage` for this submitter, or null when `stage` is the last one. */
export function nextApprovalStage(submitterRole: UserRole, stage: ApprovalStage): ApprovalStage | null {
  const chain = getApprovalChain(submitterRole);
  const index = chain.indexOf(stage);
  return index >= 0 && index < chain.length - 1 ? chain[index + 1] : null;
}

export function roleForStage(stage: ApprovalStage): UserRole {
  return STAGE_ROLE[stage];
}

export function canDecideAtStage(actorRole: UserRole, stage: ApprovalStage): boolean {
  return actorRole === STAGE_ROLE[stage];
}

/** Roles allowed to raise a change request on another employee's behalf. */
export const ON_BEHALF_SUBMITTER_ROLES: UserRole[] = [UserRole.HR_MANAGER, UserRole.HR_EXECUTIVE, UserRole.SUPER_ADMIN];
