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
import { createCompetitorRouter } from './routes/competitors.js';
import { createWinLossRouter } from './routes/winloss.js';
import { createContentRouter } from './routes/content.js';
import { createDriveRouter } from './routes/drive.js';
import { createCampaignRouter } from './routes/campaigns.js';
import { createMarketRouter } from './routes/market.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createAdminRouter } from './routes/admin.js';
import { AuthService } from './services/auth.service.js';
import { DriveConnectionService } from './services/drive-connection.service.js';
import { DocumentService } from './services/document.service.js';
import { CitationService } from './services/citation.service.js';
import { AskService } from './services/ask.service.js';
import { InsightService } from './services/insight.service.js';
import { BrandService } from './services/brand.service.js';
import { PersonaService } from './services/persona.service.js';
import { CompetitorService } from './services/competitor.service.js';
import { WinLossService } from './services/winloss.service.js';
import { ContentService } from './services/content.service.js';
import { ExportService, HttpDriveApiClient } from './services/export.service.js';
import { CampaignService } from './services/campaign.service.js';
import { MarketService } from './services/market.service.js';
import { AnalyticsService } from './services/analytics.service.js';
import { AdminService } from './services/admin.service.js';
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

  // Competitor Intelligence routes — battlecard generation and threat scoring.
  const competitorService = new CompetitorService(pool);
  app.use('/v1/competitors', createCompetitorRouter(authService, competitorService));

  // Win/Loss Analysis routes — deal pattern extraction and trend analysis.
  const winLossService = new WinLossService(pool);
  app.use('/v1/winloss', createWinLossRouter(authService, winLossService));

  // Content Generation routes — multi-format content with brand voice and persona fit scoring.
  const contentService = new ContentService(pool, llmGateway);

  // Export service — saves content drafts to Google Drive using the workspace Drive connection.
  const exportService = new ExportService(
    pool,
    { getAccessToken: (wid) => driveConnectionService.getDecryptedAccessToken(wid) },
    new HttpDriveApiClient(),
  );
  app.use('/v1/content', createContentRouter(authService, contentService, exportService));

  // Drive utility routes — folder picker for export workflow.
  app.use('/v1/drive', createDriveRouter(authService, exportService));

  // Campaign Planner routes — multi-channel campaign brief generation with email sequences and ad copy.
  const campaignService = new CampaignService(pool, llmGateway);
  app.use('/v1/campaigns', createCampaignRouter(authService, campaignService));

  // Market Intelligence routes — trend extraction, sentiment analysis, emerging topic detection.
  const marketService = new MarketService(pool, llmGateway);
  app.use('/v1/market', createMarketRouter(authService, marketService));

  // Analytics Dashboard routes — GTM dimension trends, narrative summaries, and QBR export.
  const analyticsService = new AnalyticsService(pool);
  app.use('/v1/analytics', createAnalyticsRouter(authService, analyticsService));

  // Admin Settings routes — connection management, user roles, sync schedule, audit logs.
  const adminService = new AdminService(pool);
  app.use('/v1/admin', createAdminRouter(authService, adminService));

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
