/**
 * FileProcessingService — orchestrates document ingestion.
 *
 * Pipeline per file task:
 *   1. Fetch document record and connection details from the database.
 *   2. Decrypt the Drive OAuth access token (AES-256-GCM).
 *   3. Create a GoogleDriveConnector scoped to the access token.
 *   4. Extract plain text from the file via the connector.
 *   5. Compute SHA-256 of the extracted text for change detection.
 *   6. If the document's content_hash matches → idempotent no-op (same version).
 *   7. Chunk the extracted text (~500 token chunks, 50 overlap).
 *   8. Store chunks in the database (delete stale ones first).
 *   9. Update document.content_hash and document.last_synced.
 *
 * Design decisions:
 *   - All DB access is through a plain pg.Pool — no ORM.
 *   - The DriveConnector is constructed per-task to ensure the correct access
 *     token is always used (tokens may rotate between tasks).
 *   - Failed extraction throws; the caller (route handler) decides whether to
 *     return HTTP 500 (Cloud Tasks retries) or HTTP 200 (permanent skip).
 *   - ExtractionError.permanent = true → return 200 (don't retry).
 *   - Other errors → return 500 (Cloud Tasks will retry up to its policy).
 */

import { createDecipheriv } from 'crypto';
import { createHash } from 'crypto';
import type { Pool } from 'pg';
import { createDriveConnector, type DriveConnector } from '@boba/drive-connector';
import { extractText, ExtractionError } from '../extractors/text-extractor.js';
import { chunkText } from '../chunker/chunker.js';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Task payload delivered by Cloud Tasks to POST /internal/file-process.
 * Encoded as base64 JSON in the Cloud Tasks body.
 */
export interface FileProcessTaskPayload {
  /** UUID of the documents row to process. */
  documentId: string;
  /** UUID of the workspace (tenant scoping). */
  workspaceId: string;
  /** Google Drive file ID. */
  driveFileId: string;
  /** MIME type of the file — used to route to the correct extractor. */
  mimeType: string;
  /** UUID of the drive_connections row that holds the OAuth tokens. */
  connectionId: string;
}

export type ProcessingOutcome =
  | { status: 'processed'; chunksWritten: number }
  | { status: 'skipped'; reason: string }
  | { status: 'permanent_failure'; reason: string };

// ---------------------------------------------------------------------------
// AES-256-GCM decryption (mirrors the API service implementation)
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm';
const TAG_BYTES = 16;

/**
 * Decrypts an `iv_hex:authTag_hex:ciphertext_hex` blob produced by the API
 * service's encrypt() function.
 */
function decrypt(blob: string, keyHex: string): string {
  const [ivHex, tagHex, cipherHex] = blob.split(':');
  if (!ivHex || !tagHex || !cipherHex) {
    throw new Error('Malformed encrypted token blob');
  }
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex').slice(0, TAG_BYTES);
  const ciphertext = Buffer.from(cipherHex, 'hex');
  // authTagLength option prevents GCM truncation attacks.
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}

// ---------------------------------------------------------------------------
// FileProcessingService
// ---------------------------------------------------------------------------

export class FileProcessingService {
  constructor(
    private readonly pool: Pool,
    private readonly keyHex: string = config.encryptionKeyHex,
  ) {}

  /**
   * Processes a single file task end-to-end.
   * Returns the outcome; throws only on unexpected programming errors.
   */
  async processFile(payload: FileProcessTaskPayload): Promise<ProcessingOutcome> {
    const { documentId, workspaceId, driveFileId, mimeType, connectionId } = payload;

    // ------------------------------------------------------------------
    // 1. Fetch document record to check existing content_hash.
    // ------------------------------------------------------------------
    const docResult = await this.pool.query<{
      id: string;
      content_hash: string | null;
    }>(
      `SELECT id, content_hash
         FROM documents
        WHERE id = $1 AND workspace_id = $2`,
      [documentId, workspaceId],
    );

    if (!docResult.rows[0]) {
      return {
        status: 'permanent_failure',
        reason: `Document ${documentId} not found in workspace ${workspaceId}`,
      };
    }

    const existingHash = docResult.rows[0].content_hash;

    // ------------------------------------------------------------------
    // 2. Build the Drive connector (mock needs no token; google decrypts one).
    // 3. Extract text via the connector.
    // ------------------------------------------------------------------
    let connector: DriveConnector;
    if (config.driveConnector === 'mock') {
      connector = createDriveConnector({ type: 'mock' });
    } else {
      const connResult = await this.pool.query<{ access_token_enc: string }>(
        `SELECT access_token_enc
           FROM drive_connections
          WHERE id = $1 AND workspace_id = $2`,
        [connectionId, workspaceId],
      );
      if (!connResult.rows[0]) {
        return {
          status: 'permanent_failure',
          reason: `Drive connection ${connectionId} not found for workspace ${workspaceId}`,
        };
      }
      const accessToken = decrypt(connResult.rows[0].access_token_enc, this.keyHex);
      connector = createDriveConnector({ type: 'google', googleOptions: { accessToken } });
    }

    let text: string;
    try {
      const result = await extractText(workspaceId, driveFileId, mimeType, connector);
      text = result.text;
    } catch (err) {
      if (err instanceof ExtractionError && err.permanent) {
        return { status: 'permanent_failure', reason: err.message };
      }
      // Re-throw transient errors — the caller returns HTTP 500 so Cloud Tasks retries.
      throw err;
    }

    // ------------------------------------------------------------------
    // 4. Compute SHA-256 of the full extracted text.
    // ------------------------------------------------------------------
    const contentHash = createHash('sha256').update(text, 'utf8').digest('hex');

    // ------------------------------------------------------------------
    // 5. Idempotency check — skip if content unchanged.
    // ------------------------------------------------------------------
    if (existingHash === contentHash) {
      return {
        status: 'skipped',
        reason: `Document ${documentId} content unchanged (hash: ${contentHash.slice(0, 8)}…)`,
      };
    }

    // ------------------------------------------------------------------
    // 6. Chunk the text.
    // ------------------------------------------------------------------
    const chunks = chunkText(text);

    // ------------------------------------------------------------------
    // 7. Persist chunks (delete stale, insert fresh) + update document.
    //    Wrapped in a transaction for atomicity.
    // ------------------------------------------------------------------
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Remove any chunks from a previous version of this document.
      await client.query('DELETE FROM chunks WHERE document_id = $1', [documentId]);

      // Insert new chunks.
      for (const chunk of chunks) {
        const chunkHash = createHash('sha256').update(chunk.content, 'utf8').digest('hex');
        await client.query(
          `INSERT INTO chunks
             (workspace_id, document_id, chunk_index, content, content_hash,
              embedding, embedding_pending, metadata)
           VALUES ($1, $2, $3, $4, $5, NULL, TRUE, $6::jsonb)`,
          [
            workspaceId,
            documentId,
            chunk.sequence,
            chunk.content,
            chunkHash,
            JSON.stringify(chunk.metadata),
          ],
        );
      }

      // Update the document record.
      await client.query(
        `UPDATE documents
            SET content_hash = $1,
                last_synced  = NOW(),
                updated_at   = NOW()
          WHERE id = $2`,
        [contentHash, documentId],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return { status: 'processed', chunksWritten: chunks.length };
  }
}
