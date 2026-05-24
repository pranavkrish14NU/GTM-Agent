/**
 * Drive utility routes — /v1/drive
 *
 * GET /v1/drive/folders
 *   Returns the folder tree from the workspace's connected Google Drive.
 *   Used by the frontend folder picker when exporting content drafts.
 *   Supports optional query param: parentId (to list subfolders).
 *   Returns 503 if no Drive connection is configured.
 *   Requires 'viewer' role or above.
 *
 * All routes require a valid BOBA JWT. Workspace isolation is enforced
 * by ExportService using the JWT workspace_id.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { ExportService } from '../services/export.service.js';
import { createJwtMiddleware } from '../middleware/jwt.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

export function createDriveRouter(
  authService: AuthService,
  exportService: ExportService,
): Router {
  const router = Router();
  const jwtGuard = createJwtMiddleware(authService);

  // -------------------------------------------------------------------------
  // GET /v1/drive/folders
  // Returns Google Drive folder list for the workspace's connected Drive.
  //
  // Query params:
  //   parentId (string, optional) — list subfolders of this folder ID
  //
  // Response: { folders: DriveFolder[] }
  // -------------------------------------------------------------------------
  router.get(
    '/folders',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { workspace_id } = req.user!;
        const parentId = req.query['parentId'] as string | undefined;

        const folders = await exportService.getDriveFolders(workspace_id, parentId);
        res.json({ folders });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to list Drive folders';
        // Return 503 when no Drive connection is configured
        const status = message.includes('No Google Drive connection') ? 503 : 500;
        res.status(status).json({ error: message });
      }
    },
  );

  return router;
}
