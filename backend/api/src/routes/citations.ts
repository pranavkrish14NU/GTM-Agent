/**
 * Citation routes — /v1/insights/:id/citations
 *
 * GET /v1/insights/:id/citations
 *   Returns the resolved citations for an insight, including clickable Drive URLs,
 *   confidence score, and confidence level.
 *
 * All routes require a valid BOBA JWT with at least the 'viewer' role.
 * RLS is enforced via withWorkspaceContext in CitationService — users only
 * see citations for insights in their own workspace.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { CitationService } from '../services/citation.service.js';
import { createJwtMiddleware } from '../middleware/jwt.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

export function createCitationsRouter(
  authService: AuthService,
  citationService: CitationService,
): Router {
  const router = Router({ mergeParams: true });
  const jwtGuard = createJwtMiddleware(authService);

  // -------------------------------------------------------------------------
  // GET /v1/insights/:id/citations
  // Resolves source citations for a single insight to clickable Drive URLs.
  //
  // Response:
  //   {
  //     insight_id: string,
  //     confidence_score: number,
  //     confidence_level: 'high' | 'medium' | 'low',
  //     citations: ResolvedCitation[]
  //   }
  // -------------------------------------------------------------------------
  router.get(
    '/',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params as { id: string };

      if (!id || !id.trim()) {
        res.status(400).json({ error: 'Insight ID is required' });
        return;
      }

      try {
        const result = await citationService.getCitations(
          req.user!.workspace_id,
          id,
        );

        if (!result) {
          res.status(404).json({ error: 'Insight not found' });
          return;
        }

        res.json({
          insight_id: result.insight.id,
          confidence_score: result.confidence_score,
          confidence_level: result.confidence_level,
          citations: result.citations,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to resolve citations';
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
