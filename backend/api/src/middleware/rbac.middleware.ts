/**
 * RBAC authorization middleware for Express routes.
 *
 * Provides two factory functions:
 *
 *   requireRole(minimumRole) — blocks requests where req.user.role is below
 *     the minimum privilege level.  Returns 401 if unauthenticated, 403 if
 *     the role is insufficient.
 *
 *   requireSameWorkspace() — checks that the :workspaceId (or :id) URL param
 *     matches the authenticated user's workspace_id.  Returns 403 for
 *     cross-workspace access attempts.
 *
 * Both middleware functions run AFTER createJwtMiddleware() which populates
 * req.user from the Bearer token.
 *
 * Why separate role + workspace checks?  Role checks enforce WHAT a user can
 * do; workspace checks enforce WHERE they can do it.  Combining them in a
 * single middleware conflates two orthogonal concerns and makes unit testing
 * harder.
 */

import type { Request, Response, NextFunction } from 'express';
import { hasRole, isValidRole, type Role } from '../rbac/roles.js';

// ---------------------------------------------------------------------------
// requireRole
// ---------------------------------------------------------------------------

/**
 * Returns middleware that enforces a minimum role level.
 *
 * @example
 *   router.put('/members/:userId/role',
 *     createJwtMiddleware(authService),
 *     requireRole('admin'),
 *     handler,
 *   );
 */
export function requireRole(minimumRole: Role) {
  return function rbacMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!hasRole(req.user.role, minimumRole)) {
      res.status(403).json({
        error: `Insufficient permissions — requires '${minimumRole}' or above`,
      });
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// requireSameWorkspace
// ---------------------------------------------------------------------------

/**
 * Returns middleware that blocks cross-workspace access.
 *
 * Checks the :workspaceId or :id URL parameter against req.user.workspace_id.
 * If they differ, the request is rejected with 403 — even if the user has a
 * valid JWT for a different workspace.
 */
export function requireSameWorkspace() {
  return function sameWorkspaceMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Support both :workspaceId and :id param names.
    const paramId = req.params['workspaceId'] ?? req.params['id'];

    if (paramId !== undefined && paramId !== req.user.workspace_id) {
      res.status(403).json({
        error: 'Access to this workspace is forbidden',
      });
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// requireViewerOrAbove (convenience alias — all authenticated users)
// ---------------------------------------------------------------------------

/**
 * Ensures the user is authenticated and has at least the viewer role.
 * Equivalent to requireRole('viewer') but semantically clearer at call sites.
 */
export function requireViewerOrAbove() {
  return requireRole('viewer');
}

// ---------------------------------------------------------------------------
// Viewer write-protection guard
// ---------------------------------------------------------------------------

/**
 * Blocks viewers from write operations (POST, PUT, PATCH, DELETE).
 * Attach on routes that allow read access to viewers but not writes.
 */
export function blockViewerWrites() {
  const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  return function viewerWriteGuard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (req.user.role === 'viewer' && WRITE_METHODS.has(req.method)) {
      res.status(403).json({ error: 'Viewers cannot modify content' });
      return;
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Role validation helper for request bodies
// ---------------------------------------------------------------------------

/**
 * Returns middleware that validates a `role` field in the request body.
 * Rejects with 400 if the value is not a valid BOBA role.
 */
export function validateRoleBody() {
  return function roleBodyValidator(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const { role } = req.body as { role?: unknown };
    if (!isValidRole(role)) {
      res
        .status(400)
        .json({ error: `Invalid role. Must be one of: viewer, member, admin, owner` });
      return;
    }
    next();
  };
}
