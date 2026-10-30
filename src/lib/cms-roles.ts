export const cmsRoles = ['Dev', 'Admin', 'Operator'] as const;
export type CmsRole = typeof cmsRoles[number];
export type CmsUser = { id: string; username: string; role: CmsRole; avatar?: string; profileRevision?: number };

/** Accounts created before roles existed retain their administrator access. */
export function resolveCmsRole(role: unknown): CmsRole {
  if (role === undefined) return 'Admin';
  return cmsRoles.includes(role as CmsRole) ? role as CmsRole : 'Operator';
}

export function canManageUser(actor: CmsRole, target: CmsRole): boolean {
  return actor === 'Dev' || actor === 'Admin' && target !== 'Dev';
}

export function canAssignRole(actor: CmsRole, assigned: CmsRole): boolean {
  return actor === 'Dev' || actor === 'Admin' && assigned !== 'Dev';
}

export function canPermanentlyDelete(role: CmsRole): boolean {
  return role === 'Dev' || role === 'Admin';
}
