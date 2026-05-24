/**
 * Campaign Planner routes — /v1/campaigns
 *
 * GET /v1/campaigns
 *   Returns paginated list of campaign briefs for the workspace.
 *   Summary view (excludes email sequences and ad copy).
 *   Supports: page, page_size query params.
 *   Requires 'viewer' role or above.
 *
 * GET /v1/campaigns/:id
 *   Returns a single full campaign brief by ID.
 *   Returns 404 if not found.
 *   Requires 'viewer' role or above.
 *
 * POST /v1/campaigns/generate
 *   Generates a new campaign brief using LLM + persona/brand context.
 *   Body: { name, objective, targetPersonas, channels, duration, budget?, additionalContext? }
 *   Returns the created CampaignBrief including email sequence, ad copy, and executive summary.
 *   Requires 'member' role or above.
 *
 * All routes require a valid BOBA JWT. Workspace isolation is enforced
 * by CampaignService using the JWT workspace_id.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { CampaignService } from '../services/campaign.service.js';
import { createJwtMiddleware } from '../middleware/jwt.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

export function createCampaignRouter(
  authService: AuthService,
  campaignService: CampaignService,
): Router {
  const router = Router();
  const jwtGuard = createJwtMiddleware(authService);

  // -------------------------------------------------------------------------
  // GET /v1/campaigns
  // Returns paginated campaign brief summaries for the workspace.
  //
  // Query params: page (default 1), page_size (default 20, max 100)
  //
  // Response: { data: CampaignListItem[], total, page, page_size }
  // -------------------------------------------------------------------------
  router.get(
    '/',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { workspace_id } = req.user!;
        const page = Math.max(1, parseInt((req.query['page'] as string) ?? '1', 10));
        const pageSize = Math.min(100, Math.max(1, parseInt((req.query['page_size'] as string) ?? '20', 10)));

        const result = await campaignService.getCampaigns(workspace_id, page, pageSize);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load campaigns';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/campaigns/:id
  // Returns a single campaign brief by ID.
  //
  // Response: CampaignBrief (full — includes email sequence, ad copy, citations)
  // -------------------------------------------------------------------------
  router.get(
    '/:id',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { workspace_id } = req.user!;
        const { id } = req.params as { id: string };

        const campaign = await campaignService.getCampaign(workspace_id, id);
        if (!campaign) {
          res.status(404).json({ error: 'Campaign not found.' });
          return;
        }
        res.json(campaign);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load campaign';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/campaigns/generate
  // Generates a new campaign brief using LLM + persona/brand context.
  //
  // Requires 'member' role — campaign generation is a write operation.
  //
  // Request body: CampaignGenerationRequest
  // Response: CampaignBrief (201)
  // -------------------------------------------------------------------------
  router.post(
    '/generate',
    jwtGuard,
    requireRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { workspace_id } = req.user!;
        const body = req.body as import('../services/campaign.service.js').CampaignGenerationRequest;

        if (!body.name || !body.objective || !body.duration) {
          res.status(400).json({
            error: 'Missing required fields: name, objective, duration',
          });
          return;
        }

        if (!Array.isArray(body.targetPersonas)) {
          res.status(400).json({
            error: 'Invalid field: targetPersonas must be an array',
          });
          return;
        }

        if (!Array.isArray(body.channels) || body.channels.length === 0) {
          res.status(400).json({
            error: 'Invalid field: channels must be a non-empty array',
          });
          return;
        }

        const campaign = await campaignService.generateCampaign(workspace_id, body);
        res.status(201).json(campaign);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate campaign';
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
