/**
 * Mock fixtures for Ask BOBA frontend tests.
 *
 * Committed per acceptance criterion: "Mock data/fixtures: mock API responses
 * for all Ask BOBA endpoints are committed."
 */

import type {
  AskResponse,
  AskCitation,
  QueryHistoryItem,
  QueryHistoryResult,
  ChatTurn,
  UserMessage,
  AssistantMessage,
  ErrorMessage,
} from './types.js';

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

export const FIXTURE_CITATION_DOC: AskCitation = {
  sourceFileId: 'doc-001',
  sourceFileName: 'Q4 Brand Messaging Guide',
  driveUrl: 'https://docs.google.com/document/d/gdrive-aaa/edit',
  section: 'Brand Voice',
  page: 1,
  chunkId: 'chunk-001',
  relevanceScore: 92,
};

export const FIXTURE_CITATION_SHEET: AskCitation = {
  sourceFileId: 'doc-002',
  sourceFileName: 'Competitor Analysis 2026',
  driveUrl: 'https://docs.google.com/spreadsheets/d/gdrive-bbb/edit',
  chunkId: 'chunk-002',
  relevanceScore: 78,
};

// ---------------------------------------------------------------------------
// AskResponse
// ---------------------------------------------------------------------------

export const FIXTURE_ASK_RESPONSE: AskResponse = {
  query_id: 'query-001',
  conversation_id: 'conv-001',
  answer: 'The brand voice is professional, empathetic, and data-driven.',
  evidence_summary: 'Multiple documents confirm a consistent professional tone across all communications.',
  sources: [FIXTURE_CITATION_DOC, FIXTURE_CITATION_SHEET],
  confidence_level: 'high',
  suggested_next_actions: [
    'Review the Q4 Brand Messaging Guide for the full tone guidelines.',
    'Update the persona research report to align with the brand voice.',
  ],
};

export const FIXTURE_ASK_RESPONSE_LOW_CONFIDENCE: AskResponse = {
  query_id: 'query-002',
  conversation_id: 'conv-001',
  answer: 'The indexed documents do not provide enough detail to fully answer this question.',
  evidence_summary: 'Only indirect evidence was found in the available documents.',
  sources: [],
  confidence_level: 'low',
  suggested_next_actions: [],
};

export const FIXTURE_ASK_RESPONSE_MEDIUM: AskResponse = {
  query_id: 'query-003',
  conversation_id: 'conv-002',
  answer: 'The primary persona is a VP of Sales at a mid-market company.',
  evidence_summary: 'One document partially describes the target persona.',
  sources: [FIXTURE_CITATION_DOC],
  confidence_level: 'medium',
  suggested_next_actions: ['Update the persona profile with recent research.'],
};

// ---------------------------------------------------------------------------
// Query history
// ---------------------------------------------------------------------------

export const FIXTURE_HISTORY_ITEM_1: QueryHistoryItem = {
  id: 'query-001',
  query_text: 'What is our brand voice?',
  response_summary: 'The brand voice is professional, empathetic, and data-driven.',
  conversation_id: 'conv-001',
  created_at: new Date('2026-05-24T06:00:00Z').toISOString(),
};

export const FIXTURE_HISTORY_ITEM_2: QueryHistoryItem = {
  id: 'query-002',
  query_text: 'Who are our target personas?',
  response_summary: 'Three primary personas identified: VP Sales, CMO, RevOps.',
  conversation_id: 'conv-002',
  created_at: new Date('2026-05-23T12:00:00Z').toISOString(),
};

export const FIXTURE_HISTORY_RESULT: QueryHistoryResult = {
  data: [FIXTURE_HISTORY_ITEM_1, FIXTURE_HISTORY_ITEM_2],
  total: 2,
  page: 1,
  pageSize: 20,
};

// ---------------------------------------------------------------------------
// Chat turns
// ---------------------------------------------------------------------------

export const FIXTURE_USER_TURN: UserMessage = {
  type: 'user',
  id: 'turn-u-001',
  text: 'What is our brand voice?',
};

export const FIXTURE_ASSISTANT_TURN: AssistantMessage = {
  type: 'assistant',
  id: 'turn-a-001',
  response: FIXTURE_ASK_RESPONSE,
};

export const FIXTURE_ERROR_TURN: ErrorMessage = {
  type: 'error',
  id: 'turn-e-001',
  query: 'What is our brand voice?',
  error: 'Network error: failed to fetch.',
};

export const FIXTURE_CHAT_TURNS: ChatTurn[] = [
  FIXTURE_USER_TURN,
  FIXTURE_ASSISTANT_TURN,
];

export const FIXTURE_CHAT_TURNS_WITH_ERROR: ChatTurn[] = [
  FIXTURE_USER_TURN,
  FIXTURE_ERROR_TURN,
];
