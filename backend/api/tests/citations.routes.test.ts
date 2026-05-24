/**
 * Integration tests for GET /v1/insights/:id/citations
 *
 * Tests:
 *   - 200 with resolved citations
 *   - 404 when insight not found
 *   - 401 without a valid JWT
 *   - 403 when caller lacks viewer role
 *   - 500 on service error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { InsightWithCitations } from '../src/services/citation.service.js';
import { createCitationsRouter } from '../src/routes/citations.js';
import {
  FIXTURE_CITATION_A,
  FIXTURE_CITATION_B,
  FIXTURE_INSIGHT_HIGH,
} from './fixtures/citations.js';

// ---------------------------------------------------------------------------
// Auth / JWT mock helpers (same pattern as other route tests)
// ---------------------------------------------------------------------------

function makeAuthService(role: string = 'viewer') {
  return {
    verifyJwt: vi.fn().mockResolvedValue({
      sub: 'user-001',
      workspace_id: 'ws-001',
      role,
    }),
  };
}

function makeMockCitationService(
  result: InsightWithCitations | null | Error = null,
) {
  return {
    getCitations: vi.fn().mockImplementation(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

// Build a minimal Express app that mounts the citations router under the
// same nested pattern used in production: /v1/insights/:id/citations
function buildApp(authService: ReturnType<typeof makeAuthService>, citationService: ReturnType<typeof makeMockCitationService>) {
  const app = express();
  app.use(express.json());
  // Mount at /v1/insights/:id/citations — the router uses mergeParams: true
  app.use('/v1/insights/:id/citations', createCitationsRouter(authService as never, citationService as never));
  return app;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RESOLVED_CITATION_A = {
  ...FIXTURE_CITATION_A,
  driveUrl: 'https://docs.google.com/document/d/gdrive-aaa/edit',
  mimeType: 'application/vnd.google-apps.document',
  lastSynced: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
};

const RESOLVED_CITATION_B = {
  ...FIXTURE_CITATION_B,
  driveUrl: 'https://docs.google.com/spreadsheets/d/gdrive-bbb/edit',
  mimeType: 'application/vnd.google-apps.spreadsheet',
  lastSynced: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
};

const INSIGHT_WITH_CITATIONS: InsightWithCitations = {
  insight: FIXTURE_INSIGHT_HIGH,
  citations: [RESOLVED_CITATION_A, RESOLVED_CITATION_B],
  confidence_score: 82,
  confidence_level: 'high',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /v1/insights/:id/citations', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let citationService: ReturnType<typeof makeMockCitationService>;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService('viewer');
    citationService = makeMockCitationService(INSIGHT_WITH_CITATIONS);
  });

  it('returns 200 with resolved citations for a valid insight', async () => {
    const app = buildApp(authService, citationService);
    const res = await request(app)
      .get('/v1/insights/insight-001/citations')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      insight_id: 'insight-001',
      confidence_score: 82,
      confidence_level: 'high',
    });
    expect(Array.isArray(res.body.citations)).toBe(true);
    expect(res.body.citations).toHaveLength(2);
    expect(res.body.citations[0]).toMatchObject({
      sourceFileId: 'doc-001',
      driveUrl: 'https://docs.google.com/document/d/gdrive-aaa/edit',
      mimeType: 'application/vnd.google-apps.document',
    });
  });

  it('returns 404 when the insight does not exist', async () => {
    citationService = makeMockCitationService(null);
    const app = buildApp(authService, citationService);

    const res = await request(app)
      .get('/v1/insights/nonexistent/citations')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Insight not found' });
  });

  it('returns 401 when no Authorization header is present', async () => {
    authService = {
      verifyJwt: vi.fn().mockRejectedValue(Object.assign(new Error('Unauthorized'), { statusCode: 401 })),
    };
    const app = buildApp(authService, citationService);

    const res = await request(app).get('/v1/insights/insight-001/citations');

    expect(res.status).toBe(401);
  });

  it('returns 403 when the caller has insufficient role', async () => {
    authService = makeAuthService('none');
    const app = buildApp(authService, citationService);

    const res = await request(app)
      .get('/v1/insights/insight-001/citations')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(403);
  });

  it('returns 500 when the citation service throws', async () => {
    citationService = makeMockCitationService(new Error('DB connection failed'));
    const app = buildApp(authService, citationService);

    const res = await request(app)
      .get('/v1/insights/insight-001/citations')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'DB connection failed' });
  });

  it('passes workspaceId and insightId to getCitations', async () => {
    const app = buildApp(authService, citationService);
    await request(app)
      .get('/v1/insights/insight-001/citations')
      .set('Authorization', 'Bearer valid-token');

    expect(citationService.getCitations).toHaveBeenCalledWith('ws-001', 'insight-001');
  });

  it('returns empty citations array for an insight with no sources', async () => {
    citationService = makeMockCitationService({
      insight: FIXTURE_INSIGHT_HIGH,
      citations: [],
      confidence_score: 0,
      confidence_level: 'low',
    });
    const app = buildApp(authService, citationService);

    const res = await request(app)
      .get('/v1/insights/insight-001/citations')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.citations).toHaveLength(0);
    expect(res.body.confidence_score).toBe(0);
    expect(res.body.confidence_level).toBe('low');
  });

  it('returns 500 with a generic message for non-Error throws', async () => {
    citationService = {
      getCitations: vi.fn().mockRejectedValue('unexpected string error'),
    };
    const app = buildApp(authService, citationService as never);

    const res = await request(app)
      .get('/v1/insights/insight-001/citations')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'Failed to resolve citations' });
  });
});
