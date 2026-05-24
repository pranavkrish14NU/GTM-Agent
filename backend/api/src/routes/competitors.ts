/**
 * Competitor Intelligence routes — /v1/competitors
 *
 * GET /v1/competitors
 *   Returns a list of all identified competitors with their threat scores
 *   and summary metadata for the authenticated workspace.
 *
 * GET /v1/competitors/:id/battlecard
 *   Returns the full battlecard for a single competitor by insight row ID.
 *   Includes strengths, weaknesses, differentiation matrix, messaging
 *   comparison, and counter-messaging recommendations.
 *   Returns 404 if not found in the caller's workspace.
 *
 * POST /v1/competitors/analyze
 *   Triggers on-demand battlecard generation for the caller's workspace.
 *   Requires 'member' role or above — analysis is a write operation.
 *
 * All routes require a valid BOBA JWT. Workspace isolation is enforced
 * by CompetitorService using the JWT workspace_id.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { CompetitorService } from '../services/competitor.service.js';
import { createJwtMiddleware } from '../middleware/jwt.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

export function createCompetitorRouter(
  authService: AuthService,
  competitorService: CompetitorService,
): Router {
  const router = Router();
  const jwtGuard = createJwtMiddleware(authService);

  // -------------------------------------------------------------------------
  // GET /v1/competitors
  // Returns all identified competitors with threat scores.
  //
  // Response: CompetitorSummary[]
  //   Sorted by threat_score descending (highest threat first).
  // -------------------------------------------------------------------------
  router.get(
    '/',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const competitors = await competitorService.getCompetitors(req.user!.workspace_id);
        res.json(competitors);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load competitors';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/competitors/:id/battlecard
  // Returns the full battlecard for a single competitor.
  //
  // Response: BattlecardResult
  //   or 404 if the competitor battlecard does not exist in this workspace.
  // -------------------------------------------------------------------------
  router.get(
    '/:id/battlecard',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params as { id: string };
      try {
        const battlecard = await competitorService.getBattlecard(req.user!.workspace_id, id);
        if (!battlecard) {
          res.status(404).json({
            error: 'Battlecard not found. Run POST /v1/competitors/analyze to generate one.',
          });
          return;
        }
        res.json(battlecard);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load battlecard';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/competitors/analyze
  // Triggers on-demand battlecard generation for the workspace.
  //
  // Requires 'member' role or above — generation is a write operation.
  //
  // Response: { message: 'Battlecard generation complete' }
  // -------------------------------------------------------------------------
  router.post(
    '/analyze',
    jwtGuard,
    requireRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        await competitorService.generateBattlecards(req.user!.workspace_id);
        res.json({ message: 'Battlecard generation complete' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate battlecards';
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
