/**
 * RBAC role definitions and permission matrix for BOBA.
 *
 * Roles are ordered by ascending privilege level so numeric comparisons work:
 *   viewer (0) < member (1) < admin (2) < owner (3)
 *
 * The permission matrix maps named capability strings to the minimum role
 * required to exercise that capability.  This lets individual routes declare
 * intent ("members:manage") rather than hard-coding role names.
 */

// ---------------------------------------------------------------------------
// Role type and level map
// ---------------------------------------------------------------------------

/** All valid BOBA roles, from least to most privileged. */
export const ROLES = ['viewer', 'member', 'admin', 'owner'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Numeric privilege level for each role.
 * Higher value = more privileged.
 * Used by requireRole() for ">= minimumRole" checks.
 */
export const ROLE_LEVEL: Record<Role, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
} as const;

// ---------------------------------------------------------------------------
// Permission matrix
// ---------------------------------------------------------------------------

/**
 * Named permissions mapped to the minimum role required.
 *
 * Architecture spec (Auth & Auth section):
 *   Owner  — full workspace management, billing, member management
 *   Admin  — manage connections, settings, view all content
 *   Member — search, ask questions, view insights, write content drafts
 *   Viewer — read-only dashboard access
 */
export const PERMISSION_MIN_ROLE: Record<string, Role> = {
  /** Any authenticated workspace member can read workspace details. */
  'workspace:read': 'viewer',
  /** Workspace name/plan updates — admin or above. */
  'workspace:write': 'admin',
  /** Content (insights, drafts, queries) is readable by all roles. */
  'content:read': 'viewer',
  /** Creating/editing content drafts — members and above. */
  'content:write': 'member',
  /** Managing workspace members (roles, invites) — admin or above. */
  'members:manage': 'admin',
  /** Connections, pipeline config — admin or above. */
  'settings:manage': 'admin',
  /** Deleting the workspace itself — owner only. */
  'workspace:delete': 'owner',
} as const;

export type Permission = keyof typeof PERMISSION_MIN_ROLE;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when the given role meets or exceeds the minimum required. */
export function hasRole(userRole: string, minimumRole: Role): boolean {
  const userLevel = ROLE_LEVEL[userRole as Role] ?? -1;
  return userLevel >= ROLE_LEVEL[minimumRole];
}

/** Returns true when the given role has the named permission. */
export function hasPermission(userRole: string, permission: Permission): boolean {
  const minimum = PERMISSION_MIN_ROLE[permission];
  if (minimum === undefined) return false;
  return hasRole(userRole, minimum);
}

/** Returns true if the role string is a valid BOBA role. */
export function isValidRole(role: unknown): role is Role {
  return typeof role === 'string' && (ROLES as readonly string[]).includes(role);
}
