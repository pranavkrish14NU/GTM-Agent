/**
 * Ask BOBA API client.
 *
 * Thin wrappers around the /v1/ask REST endpoints.
 * All requests are workspace-scoped via the Bearer token in localStorage
 * (handled by the shared `api` helper in services/api.ts).
 */

import { api } from '../../services/api.js';
import type { AskResponse, QueryHistoryResult } from './types.js';

/**
 * Submit a query to BOBA's RAG engine.
 *
 * @param query          The user's natural-language question.
 * @param conversationId Pass the id from the previous turn to continue a conversation.
 *                       Omit (or pass undefined) to start a new conversation.
 */
export function submitQuery(
  query: string,
  conversationId?: string,
): Promise<AskResponse> {
  return api.post<AskResponse>('/v1/ask', {
    query,
    ...(conversationId !== undefined ? { conversation_id: conversationId } : {}),
  });
}

/**
 * Paginated query history for the authenticated user.
 */
export function getHistory(page = 1, pageSize = 20): Promise<QueryHistoryResult> {
  return api.get<QueryHistoryResult>(
    `/v1/ask/history?page=${page}&pageSize=${pageSize}`,
  );
}
