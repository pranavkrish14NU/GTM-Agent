/**
 * Market Intelligence routes — /v1/market
 *
 * GET /v1/market/trends
 *   Returns the latest stored market intelligence for the workspace.
 *   Returns 404 if no analysis has been run yet.
 *   Requires 'viewer' role or above.
 *
 * GET /v1/market/brief
 *   Generates an executive market brief from stored market intelligence.
 *   Triggers a fresh analysis if no stored intelligence exists.
 *   Requires 'viewer' role or above.
 *
 * POST /v1/market/analyze
 *   Triggers a fresh market intelligence analysis pass over research documents.
 *   Returns the MarketIntelligenceResult (200).
 *   Requires 'member' role or above.
 *
 * All routes require a valid BOBA JWT. Workspace isolation is enforced
 * by MarketService using the JWT workspace_id.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { MarketService } from '../services/market.service.js';
import { createJwtMiddleware } from '../middleware/jwt.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

export function createMarketRouter(
  authService: AuthService,
  marketService: MarketService,
): Router {
  const router = Router();
  const jwtGuard = createJwtMiddleware(authService);

  // -------------------------------------------------------------------------
  // GET /v1/market/trends
  // Returns the latest stored market trends and sentiment for the workspace.
  //
  // Response: MarketIntelligenceResult or 404 if no analysis has been run.
  // -------------------------------------------------------------------------
  router.get(
    '/trends',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { workspace_id } = req.user!;
        const result = await marketService.getTrends(workspace_id);
        if (!result) {
          res.status(404).json({
            error: 'No market intelligence data found. Run POST /v1/market/analyze first.',
          });
          return;
        }
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load market trends';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/market/brief
  // Generates an executive market brief from stored or fresh analysis.
  //
  // Response: MarketBrief or 404 if analysis cannot produce results.
  // -------------------------------------------------------------------------
  router.get(
    '/brief',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { workspace_id } = req.user!;
        const brief = await marketService.getBrief(workspace_id);
        if (!brief) {
          res.status(404).json({
            error: 'Unable to generate market brief. No research documents found.',
          });
          return;
        }
        res.json(brief);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate market brief';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/market/analyze
  // Triggers a fresh market intelligence analysis over research documents.
  //
  // Requires 'member' role — analysis is a write/compute operation.
  //
  // Response: MarketIntelligenceResult (200)
  // -------------------------------------------------------------------------
  router.post(
    '/analyze',
    jwtGuard,
    requireRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { workspace_id } = req.user!;
        const result = await marketService.analyzeDocuments(workspace_id);
        res.json({
          message: 'Market intelligence analysis completed.',
          result,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to run market analysis';
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
