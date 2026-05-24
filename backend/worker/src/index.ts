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
import {
  type LLMGateway,
  LLMGatewayService,
  MockLLMProvider,
  InMemoryTokenBudgetStore,
} from '@boba/llm-gateway';
import { FileProcessingService } from './services/file-processing.service.js';
import { EmbeddingService } from './services/embedding.service.js';
import { DriveSyncService } from './services/drive-sync.service.js';
import { createInternalRouter } from './routes/internal.js';
import { config } from './config.js';
import { createLogger } from '@boba/logger';

const { Pool } = pg;

const log = createLogger({ service: 'boba-worker' });

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
  const driveSyncService = new DriveSyncService(pool, fileProcessingService, embeddingService);
  app.use('/internal', createInternalRouter(fileProcessingService, embeddingService, driveSyncService));

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

  // Embeddings run through the LLM gateway. Locally this uses the mock provider
  // (deterministic vectors); production wires real providers via env.
  const gateway = new LLMGatewayService(
    { providers: [new MockLLMProvider()] },
    new InMemoryTokenBudgetStore(),
  );

  const app = createApp(pool, gateway);

  app.listen(config.port, () => {
    log.info({ port: config.port }, 'BOBA Worker listening');
  });
}
