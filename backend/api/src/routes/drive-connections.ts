/**
 * Drive connection routes — /v1/connections/drive
 *
 * POST   /v1/connections/drive            → connect a Google Drive account
 * GET    /v1/connections/drive            → get connection status
 * PUT    /v1/connections/drive/folders    → update folder-to-module mappings
 * POST   /v1/connections/drive/sync       → trigger a manual sync
 * DELETE /v1/connections/drive            → disconnect (revoke + delete)
 *
 * All routes require a valid BOBA JWT.
 * Write routes (POST/PUT/DELETE) require at least the 'admin' role.
 * The workspace context is always derived from the JWT claims — there is no
 * workspace ID in the URL path for this resource because a user can only
 * access their own workspace's connection.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { DriveConnectionService } from '../services/drive-connection.service.js';
import { createJwtMiddleware } from '../middleware/jwt.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import type { FolderMapping } from '@boba/database';

export function createDriveConnectionsRouter(
  authService: AuthService,
  driveConnectionService: DriveConnectionService,
): Router {
  const router = Router();
  const jwtGuard = createJwtMiddleware(authService);

  // -------------------------------------------------------------------------
  // POST /v1/connections/drive
  // Creates or replaces the Drive connection for the authenticated workspace.
  // Body: { access_token, refresh_token, scopes, expires_at? }
  // -------------------------------------------------------------------------
  router.post(
    '/',
    jwtGuard,
    requireRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
      const { access_token, refresh_token, scopes, expires_at } = req.body as {
        access_token?: string;
        refresh_token?: string;
        scopes?: string[];
        expires_at?: string;
      };

      if (!access_token || !refresh_token) {
        res.status(400).json({ error: 'access_token and refresh_token are required' });
        return;
      }

      if (!Array.isArray(scopes)) {
        res.status(400).json({ error: 'scopes must be an array of strings' });
        return;
      }

      try {
        const connection = await driveConnectionService.createConnection({
          workspaceId: req.user!.workspace_id,
          userId: req.user!.user_id,
          accessToken: access_token,
          refreshToken: refresh_token,
          scopes,
          expiresAt: expires_at ? new Date(expires_at) : null,
        });

        res.status(201).json(connection);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create connection';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/connections/drive
  // Returns connection status for the authenticated workspace.
  // Readable by any workspace member.
  // -------------------------------------------------------------------------
  router.get(
    '/',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const connection = await driveConnectionService.getConnection(
          req.user!.workspace_id,
        );

        if (!connection) {
          res.json({ status: 'disconnected' });
          return;
        }

        res.json(connection);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch connection';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // PUT /v1/connections/drive/folders
  // Replaces the folder-to-module mapping configuration.
  // Body: { mappings: FolderMapping[] }
  // -------------------------------------------------------------------------
  router.put(
    '/folders',
    jwtGuard,
    requireRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
      const { mappings } = req.body as { mappings?: unknown };

      if (!Array.isArray(mappings)) {
        res.status(400).json({ error: 'mappings must be an array' });
        return;
      }

      // Validate each mapping entry has the required shape.
      for (const item of mappings) {
        const m = item as Partial<FolderMapping>;
        if (!m.folder_id || !m.module) {
          res.status(400).json({
            error: 'Each mapping must have folder_id and module fields',
          });
          return;
        }
      }

      try {
        const updated = await driveConnectionService.updateFolderMappings(
          req.user!.workspace_id,
          mappings as FolderMapping[],
        );

        if (!updated) {
          res.status(404).json({ error: 'No Drive connection found for this workspace' });
          return;
        }

        res.json(updated);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update folder mappings';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/connections/drive/sync
  // Enqueues a manual sync task for the workspace's Drive connection.
  // -------------------------------------------------------------------------
  router.post(
    '/sync',
    jwtGuard,
    requireRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        await driveConnectionService.triggerSync(req.user!.workspace_id);
        res.json({ message: 'Sync task enqueued' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to trigger sync';
        const status = message.includes('No Drive connection') ? 404 : 500;
        res.status(status).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /v1/connections/drive
  // Disconnects Drive: decrypts token for revocation log, then deletes record.
  // -------------------------------------------------------------------------
  router.delete(
    '/',
    jwtGuard,
    requireRole('admin'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const deleted = await driveConnectionService.deleteConnection(
          req.user!.workspace_id,
        );

        if (!deleted) {
          res.status(404).json({ error: 'No Drive connection found for this workspace' });
          return;
        }

        res.status(204).send();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete connection';
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
