/**
 * Ask BOBA routes — /v1/ask
 *
 * POST /v1/ask
 *   Submit a natural-language GTM question.  The service embeds the query,
 *   performs a pgvector similarity search, synthesises an answer via the LLM,
 *   and returns a structured response with citations and confidence.
 *
 *   Responses are cached for 5 minutes keyed by SHA-256(query) + workspace_id
 *   to avoid redundant embedding + LLM calls for identical repeated queries.
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
import type { CacheService } from '../services/cache.service.js';
import { hashQuery, cacheKey, CACHE_TTL_ASK_MS } from '../services/cache.service.js';
import type { AskResponse } from '../services/ask.service.js';
import { createJwtMiddleware } from '../middleware/jwt.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { llmRateLimit } from '../middleware/rate-limit.middleware.js';
import { createBodyValidator, ASK_BODY_SCHEMA } from '../middleware/validate-body.middleware.js';

export function createAskRouter(
  authService: AuthService,
  askService: AskService,
  cache?: CacheService,
): Router {
  const router = Router();
  const jwtGuard = createJwtMiddleware(authService);

  // -------------------------------------------------------------------------
  // POST /v1/ask
  // Submit a natural-language query.
  //
  // Request body: { query: string, conversation_id?: string }
  //
  // Cache behaviour:
  //   Cache key = boba:{workspace_id}:ask:{sha256(trimmed query)}
  //   TTL       = 5 minutes
  //   Cached responses are returned directly without hitting the LLM.
  //   A new conversation_id is not supplied when returning a cached response
  //   (the original query_id / conversation_id from the cached payload is used).
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

      const workspaceId = req.user!.workspace_id;
      const trimmedQuery = query.trim();

      try {
        // Cache lookup — only cache standalone queries (no conversation context),
        // since conversational replies depend on history that may change.
        if (cache && !conversation_id) {
          const key = cacheKey(workspaceId, 'ask', hashQuery(trimmedQuery));
          const cached = await cache.get<AskResponse>(key);
          if (cached !== null) {
            res.json(cached);
            return;
          }

          const result = await askService.ask(workspaceId, req.user!.user_id, trimmedQuery, undefined);
          // Fire-and-forget — don't delay the response for cache writes.
          void cache.set(key, result, CACHE_TTL_ASK_MS);
          res.json(result);
          return;
        }

        // No cache or conversational query — call service directly.
        const result = await askService.ask(
          workspaceId,
          req.user!.user_id,
          trimmedQuery,
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
