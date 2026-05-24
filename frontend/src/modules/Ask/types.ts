/**
 * Ask BOBA frontend types.
 *
 * These mirror the AskService response shapes from the backend (WO-031) and
 * add the UI-specific ChatMessage union used to render conversation history.
 */

import type { ConfidenceLevel } from '../../types/index.js';

// ---------------------------------------------------------------------------
// API response types (mirror backend AskService)
// ---------------------------------------------------------------------------

export interface AskCitation {
  sourceFileId: string;
  sourceFileName: string;
  driveUrl: string;
  section?: string;
  page?: number;
  chunkId: string;
  relevanceScore: number;
}

export interface AskResponse {
  query_id: string;
  conversation_id: string;
  answer: string;
  evidence_summary: string;
  sources: AskCitation[];
  confidence_level: ConfidenceLevel;
  suggested_next_actions: string[];
}

export interface QueryHistoryItem {
  id: string;
  query_text: string;
  response_summary: string | null;
  conversation_id: string | null;
  created_at: string;
}

export interface QueryHistoryResult {
  data: QueryHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// UI state types
// ---------------------------------------------------------------------------

/** A user's question turn in the chat UI */
export interface UserMessage {
  type: 'user';
  id: string;
  text: string;
}

/** BOBA's response turn — includes full structured answer */
export interface AssistantMessage {
  type: 'assistant';
  id: string;
  response: AskResponse;
}

/** An error that occurred while fetching a response */
export interface ErrorMessage {
  type: 'error';
  id: string;
  query: string; // original query text, for retry
  error: string;
}

export type ChatTurn = UserMessage | AssistantMessage | ErrorMessage;

export interface AskState {
  turns: ChatTurn[];
  conversationId: string | null;
  isLoading: boolean;
}
