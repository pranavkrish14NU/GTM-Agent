/**
 * Win/Loss Analysis routes — /v1/winloss
 *
 * GET /v1/winloss/patterns
 *   Returns deal patterns for the workspace: common win factors, loss factors,
 *   total wins/losses analyzed, and overall win rate.
 *   Returns 404 if no analysis has been generated yet.
 *
 * GET /v1/winloss/objections
 *   Returns objection trend analysis with persona correlation and frequency.
 *   Returns 404 if no analysis has been generated yet.
 *
 * GET /v1/winloss/competitors
 *   Returns competitor involvement analysis: win/loss counts per competitor
 *   and corrective action recommendations.
 *   Returns 404 if no analysis has been generated yet.
 *
 * POST /v1/winloss/analyze
 *   Triggers on-demand win/loss analysis for the caller's workspace.
 *   Requires 'member' role or above — analysis is a write operation.
 *
 * All routes require a valid BOBA JWT. Workspace isolation is enforced
 * by WinLossService using the JWT workspace_id.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { WinLossService } from '../services/winloss.service.js';
import { createJwtMiddleware } from '../middleware/jwt.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

export function createWinLossRouter(
  authService: AuthService,
  winLossService: WinLossService,
): Router {
  const router = Router();
  const jwtGuard = createJwtMiddleware(authService);

  /**
   * Helper: fetch analysis and return 404 if not yet generated.
   */
  async function requireAnalysis(workspaceId: string, res: Response) {
    const analysis = await winLossService.getAnalysis(workspaceId);
    if (!analysis) {
      res.status(404).json({
        error: 'No win/loss analysis found. Run POST /v1/winloss/analyze to generate one.',
      });
      return null;
    }
    return analysis;
  }

  // -------------------------------------------------------------------------
  // GET /v1/winloss/patterns
  // Returns deal patterns: win factors, loss factors, win rate.
  //
  // Response: { deal_patterns: DealPatterns, corrective_actions, sources, ... }
  // -------------------------------------------------------------------------
  router.get(
    '/patterns',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const analysis = await requireAnalysis(req.user!.workspace_id, res);
        if (!analysis) return;
        res.json({
          deal_patterns: analysis.deal_patterns,
          corrective_actions: analysis.corrective_actions,
          sources: analysis.sources,
          confidence_score: analysis.confidence_score,
          confidence_level: analysis.confidence_level,
          last_generated_at: analysis.last_generated_at,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load win/loss patterns';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/winloss/objections
  // Returns objection trend analysis with persona correlation.
  //
  // Response: { objection_analysis: ObjectionAnalysis, sources, ... }
  // -------------------------------------------------------------------------
  router.get(
    '/objections',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const analysis = await requireAnalysis(req.user!.workspace_id, res);
        if (!analysis) return;
        res.json({
          objection_analysis: analysis.objection_analysis,
          sources: analysis.sources,
          confidence_score: analysis.confidence_score,
          confidence_level: analysis.confidence_level,
          last_generated_at: analysis.last_generated_at,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load objection analysis';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/winloss/competitors
  // Returns competitor involvement analysis.
  //
  // Response: { competitor_involvement: CompetitorInvolvement, sources, ... }
  // -------------------------------------------------------------------------
  router.get(
    '/competitors',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const analysis = await requireAnalysis(req.user!.workspace_id, res);
        if (!analysis) return;
        res.json({
          competitor_involvement: analysis.competitor_involvement,
          sources: analysis.sources,
          confidence_score: analysis.confidence_score,
          confidence_level: analysis.confidence_level,
          last_generated_at: analysis.last_generated_at,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load competitor involvement';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/winloss/analyze
  // Triggers on-demand win/loss analysis for the workspace.
  //
  // Requires 'member' role or above.
  //
  // Response: { message: 'Win/loss analysis complete' }
  // -------------------------------------------------------------------------
  router.post(
    '/analyze',
    jwtGuard,
    requireRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        await winLossService.generateAnalysis(req.user!.workspace_id);
        res.json({ message: 'Win/loss analysis complete' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to run win/loss analysis';
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
