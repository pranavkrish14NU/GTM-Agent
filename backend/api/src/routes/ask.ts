/**
 * Ask BOBA routes — /v1/ask
 *
 * POST /v1/ask
 *   Submit a natural-language GTM question.  The service embeds the query,
 *   performs a pgvector similarity search, synthesises an answer via the LLM,
 *   and returns a structured response with citations and confidence.
 *
 * GET /v1/ask/history
 *   Returns paginated query history for the authenticated user.
 *
 * All routes require a valid BOBA JWT with at least the 'viewer' role.
 * Workspace isolation is enforced by AskService using the JWT workspace_id.
 */

import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import type { AskService } from '../services/ask.service.js';
import { createJwtMiddleware } from '../middleware/jwt.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { llmRateLimit } from '../middleware/rate-limit.middleware.js';
import { createBodyValidator, ASK_BODY_SCHEMA } from '../middleware/validate-body.middleware.js';

export function createAskRouter(
  authService: AuthService,
  askService: AskService,
): Router {
  const router = Router();
  const jwtGuard = createJwtMiddleware(authService);

  // -------------------------------------------------------------------------
  // POST /v1/ask
  // Submit a natural-language query.
  //
  // Request body: { query: string, conversation_id?: string }
  //
  // Response:
  //   {
  //     query_id: string,
  //     conversation_id: string,
  //     answer: string,
  //     evidence_summary: string,
  //     sources: AskCitation[],
  //     confidence_level: 'high' | 'medium' | 'low',
  //     suggested_next_actions: string[]
  //   }
  // -------------------------------------------------------------------------
  router.post(
    '/',
    jwtGuard,
    requireRole('viewer'),
    llmRateLimit(),
    createBodyValidator(ASK_BODY_SCHEMA),
    async (req: Request, res: Response): Promise<void> => {
      // query is guaranteed non-empty by createBodyValidator(ASK_BODY_SCHEMA).
      const { query, conversation_id } = req.body as {
        query: string;
        conversation_id?: string;
      };

      try {
        const result = await askService.ask(
          req.user!.workspace_id,
          req.user!.user_id,
          query.trim(),
          conversation_id,
        );
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to process query';
        res.status(500).json({ error: message });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/ask/history
  // Returns paginated query history for the authenticated user.
  //
  // Query params: page (default 1), pageSize (default 20, max 100)
  //
  // Response:
  //   { data: QueryHistoryItem[], total: number, page: number, pageSize: number }
  // -------------------------------------------------------------------------
  router.get(
    '/history',
    jwtGuard,
    requireRole('viewer'),
    async (req: Request, res: Response): Promise<void> => {
      const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
      const pageSize = Math.min(
        100,
        Math.max(1, parseInt(String(req.query['pageSize'] ?? '20'), 10) || 20),
      );

      try {
        const result = await askService.getHistory(
          req.user!.workspace_id,
          req.user!.user_id,
          page,
          pageSize,
        );
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to retrieve history';
        res.status(500).json({ error: message });
      }
    },
  );

  return router;
}
