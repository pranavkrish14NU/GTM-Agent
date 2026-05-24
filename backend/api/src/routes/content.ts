/**
 * Content Generation routes — /v1/content
 *
 * GET /v1/content/drafts
 *   Returns paginated list of content drafts for the authenticated user.
 *   Supports optional query params: page (default 1), page_size (default 20).
 *   Requires 'viewer' role or above.
 *
 * GET /v1/content/drafts/:id
 *   Returns a single content draft by ID.
 *   Returns 404 if the draft does not exist or belongs to another user.
 *   Requires 'viewer' role or above.
 *
 * POST /v1/content/generate
 *   Generates new content based on the provided brief and brand/persona context.
 *   Body: { type, topic, tone, length, channel, targetPersona?, additionalInstructions? }
 *   Returns the created ContentDraft with brand voice and persona fit scores.
 *   Requires 'member' role or above.
 *
 * PUT /v1/content/drafts/:id
 *   Refines or regenerates an existing content draft.
 *   Body: { mode: 'regenerate' | 'refine', instructions? }
 *   Returns 404 if the draft does not exist.
 *   Requires 'member' role or above.
 *
 * All routes require a valid BOBA JWT. User-level isolation is enforced
 * by ContentService using JWT user_id — users only see their own drafts.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { ContentService } from '../services/content.service.js';
import { createJwtMiddleware } from '../middleware/jwt.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';

export function createContentRouter(
  authService: AuthService,
  contentService: ContentService,
): Router {
  const router = Router();
  const jwtGuard = createJwtMiddleware(authService);

  // -------------------------------------------------------------------------
  // GET /v1/content/drafts
  // Returns paginated content drafts for the calling user.
  //
  // Query params:
  //   page      (number, default 1)
  //   page_size (number, default 20, max 100)
  //
  // Response: { data: ContentDraftSummary[], total, page, page_size }
  // -------------------------------------------------------------------------
  router.get(
    '/drafts',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { workspace_id, user_id } = req.user!;
        const page = Math.max(1, parseInt((req.query['page'] as string) ?? '1', 10));
        const pageSize = Math.min(100, Math.max(1, parseInt((req.query['page_size'] as string) ?? '20', 10)));

        const result = await contentService.getDrafts(workspace_id, user_id, page, pageSize);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load content drafts';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/content/drafts/:id
  // Returns a single content draft by ID (full text + source references).
  //
  // Returns 404 when the draft does not exist or belongs to another user.
  //
  // Response: ContentDraft
  // -------------------------------------------------------------------------
  router.get(
    '/drafts/:id',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { workspace_id, user_id } = req.user!;
        const { id } = req.params as { id: string };

        const draft = await contentService.getDraft(workspace_id, user_id, id);
        if (!draft) {
          res.status(404).json({ error: 'Content draft not found.' });
          return;
        }
        res.json(draft);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load content draft';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/content/generate
  // Generates new content and stores it as a draft.
  //
  // Requires 'member' role — content generation is a write operation.
  //
  // Request body: ContentGenerationRequest
  // Response: ContentDraft
  // -------------------------------------------------------------------------
  router.post(
    '/generate',
    jwtGuard,
    requireRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { workspace_id, user_id } = req.user!;
        const request = req.body as import('../services/content.service.js').ContentGenerationRequest;

        if (!request.type || !request.topic || !request.tone || !request.length || !request.channel) {
          res.status(400).json({
            error: 'Missing required fields: type, topic, tone, length, channel',
          });
          return;
        }

        const draft = await contentService.generateContent(workspace_id, user_id, request);
        res.status(201).json(draft);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate content';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // PUT /v1/content/drafts/:id
  // Refines or regenerates an existing content draft.
  //
  // Requires 'member' role — modification is a write operation.
  //
  // Request body: { mode: 'regenerate' | 'refine', instructions?: string }
  // Response: ContentDraft (updated)
  // -------------------------------------------------------------------------
  router.put(
    '/drafts/:id',
    jwtGuard,
    requireRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { workspace_id, user_id } = req.user!;
        const { id } = req.params as { id: string };
        const refineRequest = req.body as import('../services/content.service.js').RefineRequest;

        if (!refineRequest.mode || !['regenerate', 'refine'].includes(refineRequest.mode)) {
          res.status(400).json({
            error: 'Missing or invalid field: mode must be "regenerate" or "refine"',
          });
          return;
        }

        const draft = await contentService.refineDraft(workspace_id, user_id, id, refineRequest);
        if (!draft) {
          res.status(404).json({ error: 'Content draft not found.' });
          return;
        }
        res.json(draft);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to refine content draft';
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
