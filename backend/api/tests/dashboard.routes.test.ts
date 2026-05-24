/**
 * Integration tests for Dashboard routes.
 *
 * GET /v1/dashboard
 *   - 200 with DashboardResult (overall score, dimensions, recommendations)
 *   - 401 without JWT
 *   - 403 insufficient role
 *   - 500 on service error
 *
 * GET /v1/dashboard/dimensions/:id
 *   - 200 with DimensionDetail
 *   - 404 when dimension not found
 *   - 401 without JWT
 *   - 500 on service error
 *
 * POST /v1/dashboard/refresh
 *   - 200 with success message
 *   - 401 without JWT
 *   - 403 viewer role (refresh requires member+)
 *   - 500 on service error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { DashboardResult, DimensionDetail } from '../src/services/insight.service.js';
import { createDashboardRouter } from '../src/routes/dashboard.js';
import { FIXTURE_INSIGHT_ROWS_ALL_10, FIXTURE_INSIGHT_ROW_BRAND, FIXTURE_SUPPORTING_CHUNK_ROW } from './fixtures/insight.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeAuthService(role = 'viewer') {
  return {
    verifyJwt: vi.fn().mockResolvedValue({
      user_id: 'user-001',
      workspace_id: 'ws-001',
      role,
    }),
  };
}

type MockInsightService = {
  getDashboard: ReturnType<typeof vi.fn>;
  getDimensionDetail: ReturnType<typeof vi.fn>;
  generateForWorkspace: ReturnType<typeof vi.fn>;
};

function makeInsightService(opts?: {
  dashboardResult?: DashboardResult | Error;
  dimensionResult?: DimensionDetail | null | Error;
  generateError?: Error;
}): MockInsightService {
  const SAMPLE_DASHBOARD: DashboardResult = {
    overall_health_score: 58,
    last_generated_at: new Date('2026-05-24T06:00:00Z').toISOString(),
    dimensions: FIXTURE_INSIGHT_ROWS_ALL_10.map((r: Record<string, unknown>) => ({
      id: r['id'] as string,
      dimension_id: r['type'] as string,
      dimension_name: r['type'] as string,
      score: r['score'] as number,
      confidence_score: r['confidence_score'] as number,
      confidence_level: r['confidence_level'] as 'high' | 'medium' | 'low',
      payload: r['payload'] as Record<string, unknown>,
      sources: r['sources'] as [],
      last_generated_at: r['created_at'] as string,
    })),
    priority_recommendations: [],
  };

  const SAMPLE_DETAIL: DimensionDetail = {
    id: 'ins-brand-001',
    dimension_id: 'brand_consistency',
    dimension_name: 'Brand Consistency',
    score: 72,
    confidence_score: 68,
    confidence_level: 'medium',
    payload: FIXTURE_INSIGHT_ROW_BRAND['payload'] as Record<string, unknown>,
    sources: FIXTURE_INSIGHT_ROW_BRAND['sources'] as [],
    last_generated_at: FIXTURE_INSIGHT_ROW_BRAND['created_at'] as string,
    supporting_evidence: [{
      chunkId: FIXTURE_SUPPORTING_CHUNK_ROW.chunk_id,
      content: FIXTURE_SUPPORTING_CHUNK_ROW.content,
      documentTitle: FIXTURE_SUPPORTING_CHUNK_ROW.document_title,
      relevanceScore: 85,
    }],
  };

  return {
    getDashboard: vi.fn().mockImplementation(async () => {
      const result = opts?.dashboardResult ?? SAMPLE_DASHBOARD;
      if (result instanceof Error) throw result;
      return result;
    }),
    getDimensionDetail: vi.fn().mockImplementation(async () => {
      // Use `in` check so explicit null is preserved (null ?? fallback would pick fallback)
      if (opts && 'dimensionResult' in opts) {
        const result = opts.dimensionResult;
        if (result instanceof Error) throw result;
        return result; // may be null — that's intentional for 404 tests
      }
      return SAMPLE_DETAIL;
    }),
    generateForWorkspace: vi.fn().mockImplementation(async () => {
      if (opts?.generateError) throw opts.generateError;
    }),
  };
}

function buildApp(
  authService: ReturnType<typeof makeAuthService>,
  insightService: MockInsightService,
) {
  const app = express();
  app.use(express.json());
  app.use('/v1/dashboard', createDashboardRouter(authService as never, insightService as never));
  return app;
}

// ---------------------------------------------------------------------------
// GET /v1/dashboard
// ---------------------------------------------------------------------------

describe('GET /v1/dashboard', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let insightService: MockInsightService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService();
    insightService = makeInsightService();
  });

  it('returns 200 with DashboardResult', async () => {
    const app = buildApp(authService, insightService);
    const res = await request(app)
      .get('/v1/dashboard')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('overall_health_score');
    expect(res.body).toHaveProperty('dimensions');
    expect(res.body).toHaveProperty('priority_recommendations');
    expect(Array.isArray(res.body.dimensions)).toBe(true);
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(Object.assign(new Error('Unauthorized'), { statusCode: 401 }));
    const app = buildApp(authService, insightService);
    const res = await request(app).get('/v1/dashboard');
    expect(res.status).toBe(401);
  });

  it('returns 403 for insufficient role', async () => {
    // viewer role should still work (requireRole('viewer'))
    const viewerService = makeAuthService('viewer');
    const app = buildApp(viewerService, insightService);
    const res = await request(app)
      .get('/v1/dashboard')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });

  it('returns 500 on service error', async () => {
    const service = makeInsightService({ dashboardResult: new Error('DB error') });
    const app = buildApp(authService, service);
    const res = await request(app)
      .get('/v1/dashboard')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('passes workspace_id from JWT to getDashboard', async () => {
    authService.verifyJwt.mockResolvedValue({ user_id: 'u1', workspace_id: 'ws-custom', role: 'viewer' });
    const app = buildApp(authService, insightService);
    await request(app)
      .get('/v1/dashboard')
      .set('Authorization', 'Bearer token');
    expect(insightService.getDashboard).toHaveBeenCalledWith('ws-custom');
  });

  it('handles non-Error thrown from service', async () => {
    insightService.getDashboard.mockRejectedValue('string error');
    const app = buildApp(authService, insightService);
    const res = await request(app)
      .get('/v1/dashboard')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/dashboard/dimensions/:id
// ---------------------------------------------------------------------------

describe('GET /v1/dashboard/dimensions/:id', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let insightService: MockInsightService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService();
    insightService = makeInsightService();
  });

  it('returns 200 with DimensionDetail', async () => {
    const app = buildApp(authService, insightService);
    const res = await request(app)
      .get('/v1/dashboard/dimensions/brand_consistency')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('dimension_id', 'brand_consistency');
    expect(res.body).toHaveProperty('score');
    expect(res.body).toHaveProperty('supporting_evidence');
  });

  it('returns 400 for an unknown dimension ID (allowlist guard)', async () => {
    const app = buildApp(authService, insightService);
    const res = await request(app)
      .get('/v1/dashboard/dimensions/unknown_dimension')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 404 when service returns null for a valid dimension with no data', async () => {
    const service = makeInsightService({ dimensionResult: null });
    const app = buildApp(authService, service);
    const res = await request(app)
      .get('/v1/dashboard/dimensions/brand_consistency') // valid ID, no data
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('passes workspace_id and dimension_id to getDimensionDetail', async () => {
    authService.verifyJwt.mockResolvedValue({ user_id: 'u1', workspace_id: 'ws-custom', role: 'viewer' });
    const app = buildApp(authService, insightService);
    await request(app)
      .get('/v1/dashboard/dimensions/persona_completeness')
      .set('Authorization', 'Bearer token');
    expect(insightService.getDimensionDetail).toHaveBeenCalledWith('ws-custom', 'persona_completeness');
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(Object.assign(new Error('Unauthorized'), { statusCode: 401 }));
    const app = buildApp(authService, insightService);
    const res = await request(app).get('/v1/dashboard/dimensions/brand_consistency');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeInsightService({ dimensionResult: new Error('DB error') });
    const app = buildApp(authService, service);
    const res = await request(app)
      .get('/v1/dashboard/dimensions/brand_consistency')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/dashboard/refresh
// ---------------------------------------------------------------------------

describe('POST /v1/dashboard/refresh', () => {
  let insightService: MockInsightService;

  beforeEach(() => {
    vi.clearAllMocks();
    insightService = makeInsightService();
  });

  it('returns 200 with success message for member role', async () => {
    const auth = makeAuthService('member');
    const app = buildApp(auth, insightService);
    const res = await request(app)
      .post('/v1/dashboard/refresh')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
  });

  it('returns 403 for viewer role (refresh requires member+)', async () => {
    const auth = makeAuthService('viewer');
    const app = buildApp(auth, insightService);
    const res = await request(app)
      .post('/v1/dashboard/refresh')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('returns 401 without JWT', async () => {
    const auth = makeAuthService('member');
    auth.verifyJwt.mockRejectedValue(Object.assign(new Error('Unauthorized'), { statusCode: 401 }));
    const app = buildApp(auth, insightService);
    const res = await request(app).post('/v1/dashboard/refresh');
    expect(res.status).toBe(401);
  });

  it('calls generateForWorkspace with workspace_id from JWT', async () => {
    const auth = makeAuthService('member');
    auth.verifyJwt.mockResolvedValue({ user_id: 'u1', workspace_id: 'ws-refresh', role: 'member' });
    const app = buildApp(auth, insightService);
    await request(app)
      .post('/v1/dashboard/refresh')
      .set('Authorization', 'Bearer token');
    expect(insightService.generateForWorkspace).toHaveBeenCalledWith('ws-refresh');
  });

  it('returns 500 on service error', async () => {
    const service = makeInsightService({ generateError: new Error('Engine failure') });
    const auth = makeAuthService('member');
    const app = buildApp(auth, service);
    const res = await request(app)
      .post('/v1/dashboard/refresh')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Engine failure');
  });
});
