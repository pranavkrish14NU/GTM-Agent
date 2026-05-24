/**
 * EmbeddingService — generates and stores vector embeddings for document chunks.
 *
 * Pipeline per task:
 *   1. Fetch up to BATCH_SIZE chunks with embedding_pending = true for the document
 *   2. Call LLMGateway.generateEmbedding() for each chunk (parallel, CONCURRENCY at a time)
 *   3. UPDATE chunks SET embedding = $1::vector, embedding_pending = false
 *   4. Repeat until no pending chunks remain (Cloud Tasks will re-enqueue if needed)
 *
 * Idempotency:
 *   Chunks already embedded (embedding_pending = false) are filtered out by the
 *   WHERE clause — re-running the same task is safe.
 *
 * Retry semantics (Cloud Tasks):
 *   Thrown errors → caller returns HTTP 500 → Cloud Tasks retries
 *   Empty result  → { status: 'skipped' } → caller returns HTTP 200 (no retry)
 */

import type { Pool } from 'pg';
import type { LLMGateway } from '@boba/llm-gateway';

export interface EmbedChunksTaskPayload {
  documentId: string;
  workspaceId: string;
}

export type EmbeddingOutcome =
  | { status: 'processed'; chunksEmbedded: number }
  | { status: 'skipped'; reason: string };

/** Number of chunks fetched (and processed) per task invocation. */
const BATCH_SIZE = 100;

/**
 * Max concurrent embedding API calls within a batch.
 * Balances throughput against provider rate limits.
 */
const EMBED_CONCURRENCY = 10;

export class EmbeddingService {
  constructor(
    private readonly pool: Pool,
    private readonly gateway: LLMGateway,
  ) {}

  async processEmbeddings(payload: EmbedChunksTaskPayload): Promise<EmbeddingOutcome> {
    const { documentId, workspaceId } = payload;

    // Fetch pending chunks for this document.
    const { rows } = await this.pool.query<{ id: string; content: string }>(
      `SELECT id, content
         FROM chunks
        WHERE document_id = $1
          AND embedding_pending = true
        LIMIT $2`,
      [documentId, BATCH_SIZE],
    );

    if (rows.length === 0) {
      return { status: 'skipped', reason: 'no pending embeddings for this document' };
    }

    // Process in groups of EMBED_CONCURRENCY to control parallel API calls.
    let chunksEmbedded = 0;
    for (let i = 0; i < rows.length; i += EMBED_CONCURRENCY) {
      const group = rows.slice(i, i + EMBED_CONCURRENCY);
      await Promise.all(
        group.map(async (chunk) => {
          const resp = await this.gateway.generateEmbedding(
            { text: chunk.content },
            workspaceId,
          );

          // pgvector expects the vector literal as a JSON array string: '[0.1,0.2,...]'
          const vectorLiteral = JSON.stringify(resp.embedding);

          await this.pool.query(
            `UPDATE chunks
                SET embedding = $1::vector,
                    embedding_pending = false
              WHERE id = $2`,
            [vectorLiteral, chunk.id],
          );
          chunksEmbedded++;
        }),
      );
    }

    return { status: 'processed', chunksEmbedded };
  }
}
