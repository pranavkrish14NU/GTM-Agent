/**
 * BOBA API service entry point.
 *
 * Sets up the Express app with middleware, routes, and health endpoint,
 * then starts listening on the configured port.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import pg from 'pg';
import { LLMGatewayService, MockLLMProvider, InMemoryTokenBudgetStore } from '@boba/llm-gateway';
import { createAuthRouter } from './routes/auth.js';
import { createWorkspaceRouter } from './routes/workspaces.js';
import { createDriveConnectionsRouter } from './routes/drive-connections.js';
import { createDocumentsRouter } from './routes/documents.js';
import { createCitationsRouter } from './routes/citations.js';
import { createAskRouter } from './routes/ask.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createBrandRouter } from './routes/brand.js';
import { createPersonaRouter } from './routes/personas.js';
import { AuthService } from './services/auth.service.js';
import { DriveConnectionService } from './services/drive-connection.service.js';
import { DocumentService } from './services/document.service.js';
import { CitationService } from './services/citation.service.js';
import { AskService } from './services/ask.service.js';
import { InsightService } from './services/insight.service.js';
import { BrandService } from './services/brand.service.js';
import { PersonaService } from './services/persona.service.js';
import { CloudTasksQueue } from './tasks/task-queue.js';
import { config } from './config.js';

const { Pool } = pg;

// ---------------------------------------------------------------------------
// App factory (exported for testing)
// ---------------------------------------------------------------------------

export function createApp(pool: pg.Pool) {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  // Health check endpoint — no auth required.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'boba-api', version: '0.1.0' });
  });

  // Auth routes.
  const authService = new AuthService(pool);
  app.use('/v1/auth', createAuthRouter(authService));

  // Workspace routes (requires JWT + RBAC — see createWorkspaceRouter).
  app.use('/v1/workspaces', createWorkspaceRouter(authService, pool));

  // Drive connection routes (requires JWT + admin role — see createDriveConnectionsRouter).
  const driveConnectionService = new DriveConnectionService(pool, new CloudTasksQueue());
  app.use('/v1/connections/drive', createDriveConnectionsRouter(authService, driveConnectionService));

  // Document routes (requires JWT + viewer role — see createDocumentsRouter).
  const documentService = new DocumentService(pool);
  app.use('/v1/documents', createDocumentsRouter(authService, documentService));

  // Citation routes (nested under /v1/insights/:id — see createCitationsRouter).
  const citationService = new CitationService(pool);
  app.use('/v1/insights/:id/citations', createCitationsRouter(authService, citationService));

  // Ask BOBA routes — RAG query engine (requires JWT + viewer role).
  // Uses MockLLMProvider in dev/test; real providers are wired via env vars in production.
  const llmGateway = new LLMGatewayService(
    { providers: [new MockLLMProvider()] },
    new InMemoryTokenBudgetStore(),
  );
  const askService = new AskService(pool, llmGateway);
  app.use('/v1/ask', createAskRouter(authService, askService));

  // Dashboard routes — GTM Command Center health scores and dimension insights.
  const insightService = new InsightService(pool);
  app.use('/v1/dashboard', createDashboardRouter(authService, insightService));

  // Brand Intelligence routes — brand voice analysis, consistency scoring, drift detection.
  const brandService = new BrandService(pool);
  app.use('/v1/brand', createBrandRouter(authService, brandService));

  // Persona Intelligence routes — B2B buyer persona cards and content gap analysis.
  const personaService = new PersonaService(pool);
  app.use('/v1/personas', createPersonaRouter(authService, personaService));

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
    console.log(`BOBA API listening on port ${config.port}`);
  });
}
