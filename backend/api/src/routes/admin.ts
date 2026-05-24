/**
 * Admin routes — /v1/admin
 *
 * All endpoints require 'admin' role or above (Owner and Admin only).
 * Workspace isolation is enforced via the JWT workspace_id on every query.
 *
 * GET  /v1/admin/connections         — list all Drive connections
 * PUT  /v1/admin/connections/:id     — update connection config (scopes, folder mappings)
 * GET  /v1/admin/users               — list workspace members with roles
 * PUT  /v1/admin/users/:id/role      — update user role (owner-only for owner assignment)
 * POST /v1/admin/sync/schedule       — configure automatic sync schedule
 * GET  /v1/admin/audit-logs          — paginated audit logs with optional filters
 *
 * Significant admin actions (role change, connection update, schedule change)
 * are recorded as audit log entries for SOC 2 traceability.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { AdminService } from '../services/admin.service.js';
import { createJwtMiddleware } from '../middleware/jwt.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import type { Role } from '../rbac/roles.js';
import { isValidRole } from '../rbac/roles.js';

const SUPPORTED_SCHEDULE_TYPES = new Set(['hourly', 'daily', 'custom']);

export function createAdminRouter(
  authService: AuthService,
  adminService: AdminService,
): Router {
  const router = Router();
  const jwtGuard = createJwtMiddleware(authService);

  // All admin routes: require valid JWT + admin role minimum.
  router.use(jwtGuard, requireRole('admin'));

  // -------------------------------------------------------------------------
  // GET /v1/admin/connections
  // Returns all Drive connections for the workspace (tokens excluded).
  // -------------------------------------------------------------------------
  router.get('/connections', async (req: Request, res: Response): Promise<void> => {
    try {
      const { workspace_id } = req.user!;
      const connections = await adminService.getConnections(workspace_id);
      res.json({ connections });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch connections';
      res.status(500).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // PUT /v1/admin/connections/:id
  // Update connection scopes or folder mappings. Records an audit log entry.
  // -------------------------------------------------------------------------
  router.put('/connections/:id', async (req: Request, res: Response): Promise<void> => {
    try {
      const { workspace_id, user_id } = req.user!;
      const connectionId = req.params['id'] as string;
      const { scopes, folder_mappings } = req.body as {
        scopes?: string[];
        folder_mappings?: unknown[];
      };

      const updated = await adminService.updateConnection(workspace_id, connectionId, {
        scopes,
        folder_mappings,
      });

      if (!updated) {
        res.status(404).json({ error: 'Connection not found' });
        return;
      }

      // Record audit entry — fire-and-forget; don't block the response.
      void adminService.recordAuditLog({
        workspace_id,
        user_id,
        user_email: null,
        action: 'admin.connection_change',
        resource_type: 'connection',
        resource_id: connectionId,
        metadata: { scopes, folder_mappings },
        ip_address: req.ip ?? null,
      });

      res.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update connection';
      res.status(500).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // GET /v1/admin/users
  // Returns workspace members ordered by join date.
  // -------------------------------------------------------------------------
  router.get('/users', async (req: Request, res: Response): Promise<void> => {
    try {
      const { workspace_id } = req.user!;
      const users = await adminService.getUsers(workspace_id);
      res.json({ users });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch users';
      res.status(500).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // PUT /v1/admin/users/:id/role
  // Update a member's role. Owner-only for owner assignment.
  // Records an audit log entry on success.
  // -------------------------------------------------------------------------
  router.put('/users/:id/role', async (req: Request, res: Response): Promise<void> => {
    try {
      const { workspace_id, role: requestingRole, user_id } = req.user!;
      const targetUserId = req.params['id'] as string;
      const { role: newRole } = req.body as { role?: unknown };

      if (!isValidRole(newRole)) {
        res
          .status(400)
          .json({ error: 'Invalid role. Must be one of: viewer, member, admin, owner' });
        return;
      }

      const updated = await adminService.updateUserRole(
        workspace_id,
        targetUserId,
        newRole as Role,
        requestingRole as Role,
      );

      if (!updated) {
        res.status(404).json({ error: 'User not found in this workspace' });
        return;
      }

      void adminService.recordAuditLog({
        workspace_id,
        user_id,
        user_email: null,
        action: 'admin.role_change',
        resource_type: 'user',
        resource_id: targetUserId,
        metadata: { new_role: newRole },
        ip_address: req.ip ?? null,
      });

      res.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update user role';
      const statusCode =
        message.includes('last owner') ? 409
        : message.includes('Only owners') ? 403
        : 500;
      res.status(statusCode).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // POST /v1/admin/sync/schedule
  // Configure automatic sync schedule (hourly, daily, or custom cron).
  // Records an audit log entry on success.
  // -------------------------------------------------------------------------
  router.post('/sync/schedule', async (req: Request, res: Response): Promise<void> => {
    try {
      const { workspace_id, user_id } = req.user!;
      const { schedule_type, cron_expression } = req.body as {
        schedule_type?: unknown;
        cron_expression?: string;
      };

      if (!schedule_type || !SUPPORTED_SCHEDULE_TYPES.has(schedule_type as string)) {
        res.status(400).json({
          error: 'Invalid schedule_type. Must be one of: hourly, daily, custom',
        });
        return;
      }

      if (schedule_type === 'custom' && !cron_expression) {
        res.status(400).json({ error: 'cron_expression is required for custom schedule' });
        return;
      }

      const schedule = await adminService.scheduleSync(
        workspace_id,
        schedule_type as 'hourly' | 'daily' | 'custom',
        cron_expression,
      );

      void adminService.recordAuditLog({
        workspace_id,
        user_id,
        user_email: null,
        action: 'admin.sync_schedule',
        resource_type: 'sync_schedule',
        resource_id: schedule.id,
        metadata: { schedule_type, cron_expression },
        ip_address: req.ip ?? null,
      });

      res.json(schedule);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to configure sync schedule';
      const statusCode =
        message.includes('Invalid cron') || message.includes('required') ? 400 : 500;
      res.status(statusCode).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // GET /v1/admin/audit-logs
  // Paginated audit logs with optional filters: user_id, action, from, to.
  // Automatically enforces the 90-day retention window.
  // -------------------------------------------------------------------------
  router.get('/audit-logs', async (req: Request, res: Response): Promise<void> => {
    try {
      const { workspace_id } = req.user!;
      const { user_id, action, from, to, page, page_size } = req.query as Record<
        string,
        string | undefined
      >;

      const result = await adminService.getAuditLogs(workspace_id, {
        user_id,
        action,
        from,
        to,
        page: page !== undefined ? parseInt(page, 10) : undefined,
        page_size: page_size !== undefined ? parseInt(page_size, 10) : undefined,
      });

      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch audit logs';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
