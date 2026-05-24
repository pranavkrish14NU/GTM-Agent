/**
 * DriveSyncService — orchestrates a full workspace sync.
 *
 * This is the orchestration layer that bridges the Drive connector to the
 * ingestion pipeline (previously a stub):
 *   1. Enumerate all files from the configured Drive connector (mock or google).
 *   2. Upsert a `documents` row per file (unique on connection + drive_file_id).
 *   3. Run file processing (extract → chunk → store chunks) for each document.
 *   4. Generate embeddings for the new chunks (when a gateway is configured).
 *
 * Runs synchronously within the /internal/drive-sync request so the caller
 * (API enqueue → worker) can observe completion. For large libraries this would
 * be split into per-file Cloud Tasks; for the mock connector's ~23 files a
 * single pass is fine.
 */

import type { Pool } from 'pg';
import { createDriveConnector } from '@boba/drive-connector';
import type { FileProcessingService } from './file-processing.service.js';
import type { EmbeddingService } from './embedding.service.js';

export interface DriveSyncPayload {
  connectionId: string;
  workspaceId: string;
}

export interface DriveSyncResult {
  filesSeen: number;
  documentsUpserted: number;
  chunksWritten: number;
  chunksEmbedded: number;
  errors: string[];
}

export class DriveSyncService {
  constructor(
    private readonly pool: Pool,
    private readonly fileProcessingService: FileProcessingService,
    private readonly embeddingService?: EmbeddingService,
  ) {}

  async sync(payload: DriveSyncPayload): Promise<DriveSyncResult> {
    const { connectionId, workspaceId } = payload;
    const connector = createDriveConnector(); // selected via DRIVE_CONNECTOR env

    // 1. Enumerate every file (paginate to exhaustion).
    const files: { id: string; name: string; mimeType: string }[] = [];
    let pageToken: string | undefined;
    do {
      const res = await connector.listFiles(workspaceId, { pageSize: 100, pageToken });
      files.push(...res.files.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType })));
      pageToken = res.nextPageToken;
    } while (pageToken);

    const result: DriveSyncResult = {
      filesSeen: files.length,
      documentsUpserted: 0,
      chunksWritten: 0,
      chunksEmbedded: 0,
      errors: [],
    };

    // 2-4. Per file: upsert document, process, embed.
    for (const file of files) {
      try {
        const docRes = await this.pool.query<{ id: string }>(
          `INSERT INTO documents (workspace_id, drive_connection_id, drive_file_id, title, mime_type)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (drive_connection_id, drive_file_id)
             DO UPDATE SET title = EXCLUDED.title, mime_type = EXCLUDED.mime_type, updated_at = NOW()
           RETURNING id`,
          [workspaceId, connectionId, file.id, file.name, file.mimeType],
        );
        const documentId = docRes.rows[0]!.id;
        result.documentsUpserted++;

        const outcome = await this.fileProcessingService.processFile({
          documentId,
          workspaceId,
          driveFileId: file.id,
          mimeType: file.mimeType,
          connectionId,
        });
        if (outcome.status === 'processed') {
          result.chunksWritten += outcome.chunksWritten;
          if (this.embeddingService) {
            const emb = await this.embeddingService.processEmbeddings({ documentId, workspaceId });
            if (emb.status === 'processed') result.chunksEmbedded += emb.chunksEmbedded;
          }
        }
      } catch (err) {
        result.errors.push(`${file.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return result;
  }
}
