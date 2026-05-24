/**
 * Dashboard routes — /v1/dashboard
 *
 * GET /v1/dashboard
 *   Returns the aggregated GTM health score, all dimension scores,
 *   priority recommendations, and the last-generated timestamp.
 *   Response is cached for 5 minutes per workspace.
 *
 * GET /v1/dashboard/dimensions/:id
 *   Returns detailed insight data for a single GTM dimension,
 *   including supporting evidence chunks.
 *
 * POST /v1/dashboard/refresh
 *   Triggers an on-demand regeneration of insights for the caller's workspace.
 *   Useful when a sync is complete and the frontend wants fresh data immediately.
 *   Invalidates the dashboard cache for the workspace.
 *
 * All routes require a valid BOBA JWT with at least the 'viewer' role.
 * Workspace isolation is enforced by InsightService using the JWT workspace_id.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { InsightService } from '../services/insight.service.js';
import type { CacheService } from '../services/cache.service.js';
import { cacheKey, cachePrefix, CACHE_TTL_DASHBOARD_MS } from '../services/cache.service.js';
import { GTM_DIMENSIONS } from '../services/insight.service.js';
import { createJwtMiddleware } from '../middleware/jwt.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

/** Set of valid dimension IDs for route-level allowlist validation. */
const VALID_DIMENSION_IDS = new Set(GTM_DIMENSIONS.map((d) => d.id));

export function createDashboardRouter(
  authService: AuthService,
  insightService: InsightService,
  cache?: CacheService,
): Router {
  const router = Router();
  const jwtGuard = createJwtMiddleware(authService);

  // -------------------------------------------------------------------------
  // GET /v1/dashboard
  // Returns the GTM health overview for the authenticated workspace.
  //
  // Cache behaviour:
  //   Cache key = boba:{workspace_id}:dashboard
  //   TTL       = 5 minutes
  //   Invalidated by POST /v1/dashboard/refresh
  //
  // Response:
  //   {
  //     overall_health_score: number,
  //     last_generated_at: string | null,
  //     dimensions: DimensionInsight[],
  //     priority_recommendations: DimensionInsight[]
  //   }
  // -------------------------------------------------------------------------
  router.get(
    '/',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const workspaceId = req.user!.workspace_id;
      try {
        if (cache) {
          const key = cacheKey(workspaceId, 'dashboard');
          const cached = await cache.get(key);
          if (cached !== null) {
            res.json(cached);
            return;
          }

          const result = await insightService.getDashboard(workspaceId);
          void cache.set(key, result, CACHE_TTL_DASHBOARD_MS);
          res.json(result);
          return;
        }

        const result = await insightService.getDashboard(workspaceId);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load dashboard';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/dashboard/dimensions/:id
  // Returns detailed data for a single GTM dimension.
  //
  // Path param: id — dimension_id string (e.g. 'brand_consistency')
  //
  // Response:
  //   DimensionDetail (DimensionInsight + supporting_evidence[])
  //   or 404 if the dimension_id is unknown or no insights have been generated yet.
  // -------------------------------------------------------------------------
  router.get(
    '/dimensions/:id',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params as { id: string };

      if (!id || !id.trim()) {
        res.status(400).json({ error: 'Dimension ID is required' });
        return;
      }

      // Route-level allowlist guard — prevents arbitrary strings from reaching service logic.
      // The service also validates, but defense-in-depth at the boundary is safer.
      if (!VALID_DIMENSION_IDS.has(id)) {
        res.status(400).json({ error: `Unknown dimension ID '${id}'. Valid IDs: ${[...VALID_DIMENSION_IDS].join(', ')}` });
        return;
      }

      try {
        const result = await insightService.getDimensionDetail(
          req.user!.workspace_id,
          id,
        );

        if (!result) {
          res.status(404).json({ error: `Dimension '${id}' not found or not yet scored` });
          return;
        }

        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load dimension detail';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/dashboard/refresh
  // Triggers on-demand insight regeneration for the caller's workspace.
  //
  // Requires 'member' role or above (not viewer-only — regeneration is a
  // write operation that modifies the insights table).
  //
  // Cache invalidation: clears all boba:{workspaceId}:dashboard* keys so the
  // next GET /v1/dashboard fetches fresh scores from the DB.
  //
  // Response: { message: 'Insight regeneration complete' }
  // -------------------------------------------------------------------------
  router.post(
    '/refresh',
    jwtGuard,
    requireRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const workspaceId = req.user!.workspace_id;
      try {
        await insightService.generateForWorkspace(workspaceId);

        // Invalidate dashboard cache so next read reflects the fresh insights.
        if (cache) {
          void cache.invalidatePattern(cachePrefix(workspaceId, 'dashboard'));
        }

        res.json({ message: 'Insight regeneration complete' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to regenerate insights';
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
