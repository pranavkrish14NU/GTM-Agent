/**
 * Analytics Dashboard routes — /v1/analytics
 *
 * GET /v1/analytics/dimensions
 *   Returns all 10 GTM dimensions with scores, trend indicators (improving/
 *   stable/declining), narrative summaries, and priority alerts.
 *   Requires 'viewer' role or above.
 *
 * GET /v1/analytics/export
 *   Generates a QBR-ready export report with all dimensions, trends,
 *   recommendations, and source citations.
 *   Query param: format (pdf | markdown, default: markdown)
 *   Requires 'viewer' role or above.
 *
 * All routes require a valid BOBA JWT. Workspace isolation is enforced
 * by AnalyticsService using the JWT workspace_id.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { AnalyticsService } from '../services/analytics.service.js';
import { createJwtMiddleware } from '../middleware/jwt.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

export function createAnalyticsRouter(
  authService: AuthService,
  analyticsService: AnalyticsService,
): Router {
  const router = Router();
  const jwtGuard = createJwtMiddleware(authService);

  // -------------------------------------------------------------------------
  // GET /v1/analytics/dimensions
  // Returns all GTM dimensions with trend indicators and narrative summaries.
  //
  // Response: AnalyticsDimensionsResult
  //   { overall_health_score, overall_trend, dimensions[], priority_alerts[], ... }
  // -------------------------------------------------------------------------
  router.get(
    '/dimensions',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { workspace_id } = req.user!;
        const result = await analyticsService.getDimensions(workspace_id);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load analytics dimensions';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/analytics/export
  // Generates a QBR-ready report in the requested format.
  //
  // Query param: format = 'pdf' | 'markdown' (default: 'markdown')
  //
  // Response: QbrExport { format, content, filename, generated_at }
  // -------------------------------------------------------------------------
  router.get(
    '/export',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { workspace_id } = req.user!;
        const formatParam = (req.query['format'] as string) ?? 'markdown';

        if (formatParam !== 'pdf' && formatParam !== 'markdown') {
          res.status(400).json({
            error: 'Invalid format. Supported formats: pdf, markdown',
          });
          return;
        }

        const exportResult = await analyticsService.exportQbr(
          workspace_id,
          formatParam as 'pdf' | 'markdown',
        );
        res.json(exportResult);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate QBR export';
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
