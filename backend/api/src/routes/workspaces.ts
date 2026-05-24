/**
 * Workspace routes — /v1/workspaces/*
 *
 * GET  /v1/workspaces/:id              → get workspace details (viewer+)
 * PUT  /v1/workspaces/:id/members/:userId/role → update member role (admin+)
 *
 * All routes require a valid BOBA JWT via createJwtMiddleware.
 * Workspace membership is enforced by requireSameWorkspace.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { Pool } from 'pg';
import { createJwtMiddleware } from '../middleware/jwt.middleware.js';
import {
  requireRole,
  requireSameWorkspace,
  validateRoleBody,
} from '../middleware/rbac.middleware.js';
import {
  createWorkspaceContextMiddleware,
  withWorkspaceContext,
} from '../middleware/workspace.middleware.js';
import { isValidRole, type Role } from '../rbac/roles.js';

/** Extract a route param string safely — @types/express@5 types params as string | string[]. */
function param(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0]! : (v as string);
}

export function createWorkspaceRouter(authService: AuthService, pool: Pool): Router {
  const router = Router();

  const jwtGuard = createJwtMiddleware(authService);
  const wsContext = createWorkspaceContextMiddleware();

  // -------------------------------------------------------------------------
  // GET /v1/workspaces/:id
  // Returns workspace details — readable by any workspace member.
  // -------------------------------------------------------------------------
  router.get(
    '/:id',
    jwtGuard,
    requireSameWorkspace(),
    wsContext,
    async (req: Request, res: Response): Promise<void> => {
      const workspaceId = param(req, 'id');
      try {
        const rows = await withWorkspaceContext<Array<{
          id: string;
          name: string;
          plan: string;
          created_at: Date;
        }>>(pool, workspaceId, async (client) => {
          const result = await client.query<{
            id: string;
            name: string;
            plan: string;
            created_at: Date;
          }>('SELECT id, name, plan, created_at FROM workspaces WHERE id = $1', [workspaceId]);
          return result.rows;
        });

        if (rows.length === 0) {
          res.status(404).json({ error: 'Workspace not found' });
          return;
        }

        res.json(rows[0]);
      } catch {
        res.status(500).json({ error: 'Failed to fetch workspace' });
      }
    },
  );

  // -------------------------------------------------------------------------
  // PUT /v1/workspaces/:id/members/:userId/role
  // Allows Owner or Admin to change any member's role within the workspace.
  // An owner cannot be demoted — their role is protected.
  // -------------------------------------------------------------------------
  router.put(
    '/:id/members/:userId/role',
    jwtGuard,
    requireSameWorkspace(),
    requireRole('admin'),
    validateRoleBody(),
    wsContext,
    async (req: Request, res: Response): Promise<void> => {
      const workspaceId = param(req, 'id');
      const targetUserId = param(req, 'userId');
      const newRole = (req.body as { role: Role }).role;
      const requestingRole = req.user!.role as Role;

      // Only owners can assign the owner role.
      if (newRole === 'owner' && requestingRole !== 'owner') {
        res.status(403).json({ error: 'Only owners can assign the owner role' });
        return;
      }

      try {
        const updated = await withWorkspaceContext<{ id: string; email: string; role: string } | null>(
          pool,
          workspaceId,
          async (client) => {
            // Prevent demoting the last owner.
            if (newRole !== 'owner') {
              const ownerCheck = await client.query<{ count: string }>(
                `SELECT COUNT(*) AS count FROM users
                 WHERE workspace_id = $1 AND role = 'owner'`,
                [workspaceId],
              );
              const ownerCount = parseInt(ownerCheck.rows[0]?.count ?? '0', 10);
              const targetResult = await client.query<{ role: string }>(
                `SELECT role FROM users WHERE id = $1 AND workspace_id = $2`,
                [targetUserId, workspaceId],
              );
              const targetIsOwner = targetResult.rows[0]?.role === 'owner';

              if (targetIsOwner && ownerCount <= 1) {
                return null; // Will trigger 409 below
              }
            }

            const result = await client.query<{ id: string; email: string; role: string }>(
              `UPDATE users SET role = $1
               WHERE id = $2 AND workspace_id = $3
               RETURNING id, email, role`,
              [newRole, targetUserId, workspaceId],
            );
            return result.rows[0] ?? null;
          },
        );

        if (updated === null) {
          // Null means either last-owner protection triggered or user not found.
          const exists = await pool.query(
            'SELECT 1 FROM users WHERE id = $1 AND workspace_id = $2',
            [targetUserId, workspaceId],
          );
          if ((exists.rowCount ?? 0) === 0) {
            res.status(404).json({ error: 'User not found in this workspace' });
          } else {
            res.status(409).json({ error: 'Cannot remove the last owner of a workspace' });
          }
          return;
        }

        res.json({ id: updated.id, email: updated.email, role: updated.role });
      } catch {
        res.status(500).json({ error: 'Failed to update member role' });
      }
    },
  );

  return router;
}
