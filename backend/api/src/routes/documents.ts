/**
 * Document routes — /v1/documents
 *
 * GET  /v1/documents              → paginated list, sorted by last_synced DESC
 * GET  /v1/documents/duplicates   → groups of docs sharing the same content_hash
 * GET  /v1/documents/outdated     → docs with freshness score below threshold
 * GET  /v1/documents/search       → full-text search across title + chunk content
 * GET  /v1/documents/health       → sync health metrics (total, synced, avg freshness)
 *
 * All routes require a valid BOBA JWT with at least the 'viewer' role.
 * The workspace is always derived from JWT claims — no workspace ID in the URL.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { DocumentService } from '../services/document.service.js';
import { createJwtMiddleware } from '../middleware/jwt.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

export function createDocumentsRouter(
  authService: AuthService,
  documentService: DocumentService,
): Router {
  const router = Router();
  const jwtGuard = createJwtMiddleware(authService);

  // -------------------------------------------------------------------------
  // GET /v1/documents
  // Returns a paginated list of documents for the workspace, sorted by
  // last_synced DESC. Freshness scores are computed at query time.
  //
  // Query params:
  //   page     — 1-based page number (default: 1)
  //   pageSize — items per page, max 100 (default: 20)
  // -------------------------------------------------------------------------
  router.get(
    '/',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const page = parseInt(req.query['page'] as string ?? '1', 10);
      const pageSize = parseInt(req.query['pageSize'] as string ?? '20', 10);

      try {
        const result = await documentService.listDocuments(req.user!.workspace_id, {
          page: isNaN(page) ? 1 : page,
          pageSize: isNaN(pageSize) ? 20 : pageSize,
        });
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to list documents';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/documents/duplicates
  // Returns groups of documents that share the same content_hash.
  // Each group contains 2+ documents with identical content.
  // -------------------------------------------------------------------------
  router.get(
    '/duplicates',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const groups = await documentService.getDuplicates(req.user!.workspace_id);
        res.json(groups);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch duplicates';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/documents/outdated
  // Returns documents whose freshness score is below the threshold.
  //
  // Query params:
  //   threshold — freshness score cutoff (0–100, default: 30)
  // -------------------------------------------------------------------------
  router.get(
    '/outdated',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const raw = req.query['threshold'] as string | undefined;
      const threshold = raw !== undefined ? parseInt(raw, 10) : 30;

      if (raw !== undefined && (isNaN(threshold) || threshold < 0 || threshold > 100)) {
        res.status(400).json({ error: 'threshold must be an integer between 0 and 100' });
        return;
      }

      try {
        const docs = await documentService.getOutdated(req.user!.workspace_id, threshold);
        res.json(docs);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch outdated documents';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/documents/search?q=<query>
  // Full-text search across document titles and chunk content.
  // Uses PostgreSQL to_tsvector / plainto_tsquery.
  //
  // Query params:
  //   q — search query string (required)
  // -------------------------------------------------------------------------
  router.get(
    '/search',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const q = req.query['q'] as string | undefined;

      if (!q || !q.trim()) {
        res.status(400).json({ error: 'q query parameter is required' });
        return;
      }

      try {
        const docs = await documentService.search(req.user!.workspace_id, q);
        res.json(docs);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to search documents';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/documents/health
  // Returns aggregate sync health metrics for the workspace:
  //   total_files, synced_files, average_freshness, error_count
  // -------------------------------------------------------------------------
  router.get(
    '/health',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const metrics = await documentService.getHealth(req.user!.workspace_id);
        res.json(metrics);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch health metrics';
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
