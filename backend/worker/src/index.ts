/**
 * BOBA Document Ingestion Worker — entry point.
 *
 * Exposes internal HTTP endpoints consumed by Google Cloud Tasks:
 *   POST /internal/file-process  — process a single Drive file into chunks
 *   POST /internal/embed-chunks  — generate embeddings for pending chunks
 *   POST /internal/drive-sync    — accept sync task
 *   GET  /health                 — liveness probe
 */

import express from 'express';
import pg from 'pg';
import type { LLMGateway } from '@boba/llm-gateway';
import { FileProcessingService } from './services/file-processing.service.js';
import { EmbeddingService } from './services/embedding.service.js';
import { createInternalRouter } from './routes/internal.js';
import { config } from './config.js';

const { Pool } = pg;

// ---------------------------------------------------------------------------
// App factory (exported for testing)
// ---------------------------------------------------------------------------

export function createApp(pool: pg.Pool, gateway?: LLMGateway) {
  const app = express();

  app.use(express.json());

  // Liveness probe — no auth required.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'boba-worker', version: '0.1.0' });
  });

  const fileProcessingService = new FileProcessingService(pool);
  const embeddingService = gateway ? new EmbeddingService(pool, gateway) : undefined;
  app.use('/internal', createInternalRouter(fileProcessingService, embeddingService));

  // 404 handler.
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Server startup (only when run directly, not imported in tests)
// ---------------------------------------------------------------------------

if (process.env['NODE_ENV'] !== 'test') {
  const pool = new Pool({ connectionString: config.databaseUrl });

  const app = createApp(pool);

  app.listen(config.port, () => {
    console.log(`BOBA Worker listening on port ${config.port}`);
  });
}
