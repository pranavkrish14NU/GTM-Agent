/**
 * BOBA API service entry point.
 *
 * Sets up the Express app with middleware, routes, and health endpoint,
 * then starts listening on the configured port.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import pg from 'pg';
import { createAuthRouter } from './routes/auth.js';
import { createWorkspaceRouter } from './routes/workspaces.js';
import { createDriveConnectionsRouter } from './routes/drive-connections.js';
import { createDocumentsRouter } from './routes/documents.js';
import { AuthService } from './services/auth.service.js';
import { DriveConnectionService } from './services/drive-connection.service.js';
import { DocumentService } from './services/document.service.js';
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
