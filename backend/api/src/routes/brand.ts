/**
 * Brand Intelligence routes — /v1/brand
 *
 * GET /v1/brand/analysis
 *   Returns the latest brand voice profile, positioning themes, and
 *   consistency score for the authenticated workspace.
 *   Returns 404 if no analysis has been generated yet.
 *
 * GET /v1/brand/drift
 *   Returns drift alerts for documents that deviate from the brand baseline.
 *   Returns an empty list if no analysis has been generated.
 *
 * POST /v1/brand/analyze
 *   Triggers an on-demand brand analysis pipeline for the caller's workspace.
 *   Requires 'member' role or above (analysis is a write operation that updates
 *   the insights table with new brand analysis results).
 *
 * All routes require a valid BOBA JWT.  Workspace isolation is enforced by
 * BrandService using the JWT workspace_id.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { BrandService } from '../services/brand.service.js';
import { createJwtMiddleware } from '../middleware/jwt.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

export function createBrandRouter(
  authService: AuthService,
  brandService: BrandService,
): Router {
  const router = Router();
  const jwtGuard = createJwtMiddleware(authService);

  // -------------------------------------------------------------------------
  // GET /v1/brand/analysis
  // Returns the latest brand voice profile, positioning, and consistency score.
  //
  // Response: BrandAnalysisResult
  //   or 404 if no brand analysis has been generated yet.
  // -------------------------------------------------------------------------
  router.get(
    '/analysis',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const result = await brandService.getAnalysis(req.user!.workspace_id);
        if (!result) {
          res.status(404).json({
            error: 'No brand analysis found. Run POST /v1/brand/analyze to generate one.',
          });
          return;
        }
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load brand analysis';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/brand/drift
  // Returns documents that deviate from the established brand voice baseline.
  //
  // Response: DriftAnalysisResult
  //   { alerts: DriftAlert[], total: number, consistency_baseline: number }
  // -------------------------------------------------------------------------
  router.get(
    '/drift',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const result = await brandService.getDriftAlerts(req.user!.workspace_id);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load drift alerts';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/brand/analyze
  // Triggers on-demand brand analysis for the caller's workspace.
  //
  // Requires 'member' role or above — analysis is a write operation.
  //
  // NOTE: Each call runs 2 DB queries (brand chunks + upsert).  Rate limiting
  // should be applied before production deployment (tracked as a hardening item).
  //
  // Response: { message: 'Brand analysis complete' }
  // -------------------------------------------------------------------------
  router.post(
    '/analyze',
    jwtGuard,
    requireRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        await brandService.generateAnalysis(req.user!.workspace_id);
        res.json({ message: 'Brand analysis complete' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to run brand analysis';
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
