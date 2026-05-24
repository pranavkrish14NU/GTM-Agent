/**
 * AskService — RAG query engine for Ask BOBA conversational interface.
 *
 * Pipeline (per query):
 *   1. generateEmbedding()  — embed the user query via LLMGateway
 *   2. vectorSearch()       — cosine ANN search in pgvector for top-10 chunks
 *   3. fetchConversation()  — retrieve prior turns for multi-turn context
 *   4. synthesise()         — call LLM chat completion with chunks + history
 *   5. parseResponse()      — extract structured JSON from LLM output
 *   6. storeQuery()         — persist query + response in queries table
 *
 * All DB queries are executed directly on the pool (no withWorkspaceContext
 * needed here — vector search is scoped by workspace_id in the WHERE clause,
 * and the queries table uses the same workspace_id FK).
 *
 * Architecture note:
 *   The service depends on @boba/llm-gateway (LLMGateway interface) which
 *   abstracts over OpenAI, Anthropic, and Gemini providers.  Tests inject a
 *   MockLLMProvider so no real API calls are made.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { LLMGateway } from '@boba/llm-gateway';
import { buildDriveUrl } from './citation.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Source citation in an Ask BOBA response — resolved to a Drive URL at query time */
export interface AskCitation {
  sourceFileId: string;
  sourceFileName: string;
  driveUrl: string;
  section?: string;
  page?: number;
  chunkId: string;
  /** Cosine similarity scaled 0–100 */
  relevanceScore: number;
}

export interface AskResponse {
  query_id: string;
  conversation_id: string;
  answer: string;
  evidence_summary: string;
  sources: AskCitation[];
  confidence_level: 'high' | 'medium' | 'low';
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
// Internal types for DB rows
// ---------------------------------------------------------------------------

interface ChunkSearchRow {
  chunk_id: string;
  content: string;
  metadata: Record<string, unknown>;
  document_id: string;
  document_title: string;
  drive_file_id: string;
  mime_type: string;
  similarity_score: number;
}

interface ConversationTurn {
  query_text: string;
  answer: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of top chunks to retrieve for RAG context */
const TOP_K = 10;

/** Maximum prior turns to include in multi-turn context */
const MAX_CONVERSATION_TURNS = 5;

/** System prompt template for the LLM */
const SYSTEM_PROMPT = `You are BOBA, an expert AI assistant for Go-To-Market (GTM) strategy.
You answer questions based ONLY on the document chunks provided — never fabricate information.
If the chunks do not contain enough information to answer the question, say so clearly.

You MUST respond with valid JSON and nothing else — no preamble, no explanation, no markdown.
Use exactly this schema:
{
  "answer": "<direct, helpful answer to the question>",
  "evidence_summary": "<1-2 sentences summarising what the source documents say about this topic>",
  "confidence": "<high|medium|low>",
  "suggested_next_actions": ["<concrete next step 1>", "<concrete next step 2>"]
}

Confidence guidelines:
  high   — 3 or more chunks directly and clearly answer the question
  medium — 1–2 chunks partially address the question
  low    — only indirect or limited evidence available`;

// ---------------------------------------------------------------------------
// AskService
// ---------------------------------------------------------------------------

export class AskService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly gateway: LLMGateway,
  ) {}

  // -------------------------------------------------------------------------
  // ask — main RAG pipeline
  // -------------------------------------------------------------------------

  async ask(
    workspaceId: string,
    userId: string,
    query: string,
    conversationId?: string,
  ): Promise<AskResponse> {
    // 1. Embed the query
    const embeddingResp = await this.gateway.generateEmbedding(
      { text: query },
      workspaceId,
    );
    const vectorLiteral = JSON.stringify(embeddingResp.embedding);

    // 2. Vector search — top-K chunks by cosine similarity
    const chunks = await this.vectorSearch(workspaceId, vectorLiteral);

    // 3. Fetch conversation history if continuing a conversation
    const history = conversationId
      ? await this.fetchConversation(workspaceId, conversationId)
      : [];

    // 4. Synthesise answer via LLM
    const llmResponse = await this.synthesise(query, chunks, history);

    // 5. Parse structured response
    const parsed = this.parseResponse(llmResponse);

    // 6. Build citation objects from the retrieved chunks
    const sources: AskCitation[] = chunks.map((c) => ({
      sourceFileId: c.document_id,
      sourceFileName: c.document_title,
      driveUrl: buildDriveUrl(c.drive_file_id, c.mime_type),
      section: (c.metadata['section'] as string | undefined),
      page: (c.metadata['page'] as number | undefined),
      chunkId: c.chunk_id,
      relevanceScore: Math.round(c.similarity_score * 100),
    }));

    // 7. Determine conversation_id: use provided one or start a new conversation
    const resolvedConversationId = conversationId ?? randomUUID();

    // 8. Persist the query
    const queryId = await this.storeQuery(
      workspaceId,
      userId,
      query,
      parsed.answer,
      resolvedConversationId,
      { ...parsed, sources },
    );

    return {
      query_id: queryId,
      conversation_id: resolvedConversationId,
      answer: parsed.answer,
      evidence_summary: parsed.evidence_summary,
      sources,
      confidence_level: parsed.confidence,
      suggested_next_actions: parsed.suggested_next_actions,
    };
  }

  // -------------------------------------------------------------------------
  // getHistory — paginated query history for a user
  // -------------------------------------------------------------------------

  async getHistory(
    workspaceId: string,
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<QueryHistoryResult> {
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      this.pool.query<QueryHistoryItem>(
        `SELECT id, query_text, response_summary, conversation_id, created_at
           FROM queries
          WHERE workspace_id = $1 AND user_id = $2
          ORDER BY created_at DESC
          LIMIT $3 OFFSET $4`,
        [workspaceId, userId, pageSize, offset],
      ),
      this.pool.query<{ count: string }>(
        `SELECT COUNT(*) as count
           FROM queries
          WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, userId],
      ),
    ]);

    return {
      data: dataResult.rows,
      total: parseInt(countResult.rows[0]?.count ?? '0', 10),
      page,
      pageSize,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async vectorSearch(
    workspaceId: string,
    vectorLiteral: string,
  ): Promise<ChunkSearchRow[]> {
    const { rows } = await this.pool.query<ChunkSearchRow>(
      `SELECT
          c.id          AS chunk_id,
          c.content,
          c.metadata,
          d.id          AS document_id,
          d.title       AS document_title,
          d.drive_file_id,
          d.mime_type,
          1 - (c.embedding <=> $1::vector) AS similarity_score
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
        WHERE c.workspace_id = $2
          AND c.embedding_pending = false
          AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> $1::vector
        LIMIT $3`,
      [vectorLiteral, workspaceId, TOP_K],
    );
    return rows;
  }

  private async fetchConversation(
    workspaceId: string,
    conversationId: string,
  ): Promise<ConversationTurn[]> {
    const { rows } = await this.pool.query<ConversationTurn>(
      `SELECT
          query_text,
          response_json->>'answer' AS answer
         FROM queries
        WHERE workspace_id = $1 AND conversation_id = $2
        ORDER BY created_at ASC
        LIMIT $3`,
      [workspaceId, conversationId, MAX_CONVERSATION_TURNS],
    );
    return rows;
  }

  private async synthesise(
    query: string,
    chunks: ChunkSearchRow[],
    history: ConversationTurn[],
  ): Promise<string> {
    // Build the context block from retrieved chunks
    const contextBlock = chunks
      .map((c, i) => {
        const section = c.metadata['section'] ? `, Section: ${c.metadata['section']}` : '';
        const page = c.metadata['page'] ? `, Page: ${c.metadata['page']}` : '';
        return `[${i + 1}] (From: ${c.document_title}${section}${page})\n${c.content}`;
      })
      .join('\n\n');

    // Build conversation history as prior messages
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    for (const turn of history) {
      messages.push({ role: 'user', content: turn.query_text });
      if (turn.answer) {
        messages.push({ role: 'assistant', content: turn.answer });
      }
    }

    // Current user message: chunks + query
    const userContent = chunks.length > 0
      ? `Document chunks:\n${contextBlock}\n\nQuestion: ${query}`
      : `Question: ${query}\n\n(No relevant document chunks were found for this query.)`;

    messages.push({ role: 'user', content: userContent });

    const resp = await this.gateway.chatCompletion(
      { messages, temperature: 0.2, maxTokens: 1024 },
      // workspaceId is not threaded through here because gateway scoping
      // is done at the ask() level for embedding; synthesis is workspace-agnostic
    );

    return resp.message.content;
  }

  private parseResponse(raw: string): {
    answer: string;
    evidence_summary: string;
    confidence: 'high' | 'medium' | 'low';
    suggested_next_actions: string[];
  } {
    // Strip markdown code fences if the LLM wrapped the JSON
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    try {
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      const confidence = parsed['confidence'];
      return {
        answer: String(parsed['answer'] ?? ''),
        evidence_summary: String(parsed['evidence_summary'] ?? ''),
        confidence: (confidence === 'high' || confidence === 'medium') ? confidence : 'low',
        suggested_next_actions: Array.isArray(parsed['suggested_next_actions'])
          ? (parsed['suggested_next_actions'] as unknown[]).map(String)
          : [],
      };
    } catch {
      // If the LLM did not return valid JSON, surface the raw text as the answer
      return {
        answer: raw,
        evidence_summary: '',
        confidence: 'low',
        suggested_next_actions: [],
      };
    }
  }

  private async storeQuery(
    workspaceId: string,
    userId: string,
    queryText: string,
    responseSummary: string,
    conversationId: string,
    responseJson: unknown,
  ): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO queries
          (workspace_id, user_id, query_text, response_summary, response_json, conversation_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
      [workspaceId, userId, queryText, responseSummary, JSON.stringify(responseJson), conversationId],
    );
    return rows[0]!.id;
  }
}
