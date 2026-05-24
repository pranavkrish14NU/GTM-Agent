/**
 * Internal routes — consumed by Google Cloud Tasks only.
 *
 * These endpoints are NOT exposed to the public internet; they must be placed
 * behind a service-account-authenticated Cloud Tasks OIDC target in production.
 *
 * POST /internal/file-process
 *   Accepts a Cloud Tasks HTTP task whose body contains:
 *     { payload: "<base64-encoded FileProcessTaskPayload JSON>" }
 *
 * POST /internal/embed-chunks
 *   Accepts a Cloud Tasks HTTP task to generate embeddings for a document's chunks.
 *     { payload: "<base64-encoded EmbedChunksTaskPayload JSON>" }
 *
 *   Response semantics (critical — controls Cloud Tasks retry behaviour):
 *     200  → task succeeded or is permanently unprocessable (no retry)
 *     400  → malformed payload — bad task definition, no retry useful
 *     500  → transient failure — Cloud Tasks will retry up to its policy
 *
 * POST /internal/drive-sync
 *   Accepted for forward-compatibility (enqueued by DriveConnectionService).
 *   Returns 200 immediately; actual sync dispatching is handled by a future WO.
 */

import { Router, type Request, type Response } from 'express';
import type { FileProcessingService, FileProcessTaskPayload } from '../services/file-processing.service.js';
import type { EmbeddingService, EmbedChunksTaskPayload } from '../services/embedding.service.js';
import type { DriveSyncService, DriveSyncPayload } from '../services/drive-sync.service.js';

export function createInternalRouter(
  fileProcessingService: FileProcessingService,
  embeddingService?: EmbeddingService,
  driveSyncService?: DriveSyncService,
): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // POST /internal/file-process
  // -------------------------------------------------------------------------
  router.post('/file-process', async (req: Request, res: Response): Promise<void> => {
    // Cloud Tasks sends tasks as JSON: { payload: "<base64 JSON>" }
    const body = req.body as { payload?: string };
    if (!body?.payload) {
      res.status(400).json({ error: 'Missing payload field in request body' });
      return;
    }

    let taskPayload: FileProcessTaskPayload;
    try {
      const decoded = Buffer.from(body.payload, 'base64').toString('utf8');
      taskPayload = JSON.parse(decoded) as FileProcessTaskPayload;
    } catch {
      res.status(400).json({ error: 'Payload is not valid base64-encoded JSON' });
      return;
    }

    // Validate required fields.
    const { documentId, workspaceId, driveFileId, mimeType, connectionId } = taskPayload;
    if (!documentId || !workspaceId || !driveFileId || !mimeType || !connectionId) {
      res.status(400).json({
        error: 'Payload missing required fields: documentId, workspaceId, driveFileId, mimeType, connectionId',
      });
      return;
    }

    try {
      const outcome = await fileProcessingService.processFile(taskPayload);

      if (outcome.status === 'permanent_failure') {
        // Return 200 so Cloud Tasks stops retrying — failure is logged.
        console.error(`[worker] Permanent failure for document ${documentId}: ${outcome.reason}`);
        res.json({ status: 'permanent_failure', reason: outcome.reason });
        return;
      }

      if (outcome.status === 'skipped') {
        console.log(`[worker] Skipped document ${documentId}: ${outcome.reason}`);
        res.json({ status: 'skipped', reason: outcome.reason });
        return;
      }

      // status === 'processed'
      console.log(
        `[worker] Processed document ${documentId}: ${outcome.chunksWritten} chunks written`,
      );
      res.json({ status: 'processed', chunksWritten: outcome.chunksWritten });
    } catch (err) {
      // Transient error — Cloud Tasks will retry.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Transient error processing document ${documentId}: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // POST /internal/embed-chunks
  // Generates vector embeddings for all pending chunks of a document.
  // -------------------------------------------------------------------------
  router.post('/embed-chunks', async (req: Request, res: Response): Promise<void> => {
    if (!embeddingService) {
      res.status(503).json({ error: 'Embedding service not configured' });
      return;
    }

    const body = req.body as { payload?: string };
    if (!body?.payload) {
      res.status(400).json({ error: 'Missing payload field in request body' });
      return;
    }

    let taskPayload: EmbedChunksTaskPayload;
    try {
      const decoded = Buffer.from(body.payload, 'base64').toString('utf8');
      taskPayload = JSON.parse(decoded) as EmbedChunksTaskPayload;
    } catch {
      res.status(400).json({ error: 'Payload is not valid base64-encoded JSON' });
      return;
    }

    const { documentId, workspaceId } = taskPayload;
    if (!documentId || !workspaceId) {
      res.status(400).json({
        error: 'Payload missing required fields: documentId, workspaceId',
      });
      return;
    }

    try {
      const outcome = await embeddingService.processEmbeddings(taskPayload);

      if (outcome.status === 'skipped') {
        console.log(`[worker] Embed skipped for document ${documentId}: ${outcome.reason}`);
        res.json({ status: 'skipped', reason: outcome.reason });
        return;
      }

      console.log(
        `[worker] Embedded ${outcome.chunksEmbedded} chunks for document ${documentId}`,
      );
      res.json({ status: 'processed', chunksEmbedded: outcome.chunksEmbedded });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Transient embedding error for document ${documentId}: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // POST /internal/drive-sync
  // Enumerates the connector's files, upserts documents, and runs the
  // extract → chunk → embed pipeline for each. Body: { payload: base64 JSON }.
  // -------------------------------------------------------------------------
  router.post('/drive-sync', async (req: Request, res: Response): Promise<void> => {
    if (!driveSyncService) {
      res.status(503).json({ error: 'Drive sync service not configured' });
      return;
    }

    const body = req.body as { payload?: string };
    if (!body?.payload) {
      res.status(400).json({ error: 'Missing payload field in request body' });
      return;
    }

    let taskPayload: DriveSyncPayload;
    try {
      const decoded = Buffer.from(body.payload, 'base64').toString('utf8');
      taskPayload = JSON.parse(decoded) as DriveSyncPayload;
    } catch {
      res.status(400).json({ error: 'Payload is not valid base64-encoded JSON' });
      return;
    }

    if (!taskPayload.connectionId || !taskPayload.workspaceId) {
      res.status(400).json({ error: 'Payload missing required fields: connectionId, workspaceId' });
      return;
    }

    try {
      const result = await driveSyncService.sync(taskPayload);
      console.log(
        `[worker] Drive sync complete: ${result.documentsUpserted} docs, ` +
          `${result.chunksWritten} chunks, ${result.chunksEmbedded} embedded, ` +
          `${result.errors.length} errors`,
      );
      res.json({ status: 'processed', ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Drive sync failed: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  return router;
}
