/**
 * Integration tests for Brand Intelligence routes.
 *
 * GET /v1/brand/analysis
 *   - 200 with BrandAnalysisResult when data exists
 *   - 404 when no analysis has been generated
 *   - 401 without JWT
 *   - 500 on service error
 *
 * GET /v1/brand/drift
 *   - 200 with DriftAnalysisResult (empty alerts if no data)
 *   - 401 without JWT
 *   - 500 on service error
 *
 * POST /v1/brand/analyze
 *   - 200 with success message for member role
 *   - 403 for viewer role
 *   - 401 without JWT
 *   - 500 on service error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { BrandAnalysisResult, DriftAnalysisResult } from '../src/services/brand.service.js';
import { createBrandRouter } from '../src/routes/brand.js';
import {
  FIXTURE_BRAND_ANALYSIS_RESULT,
  FIXTURE_DRIFT_RESULT,
} from './fixtures/brand.js';

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

type MockBrandService = {
  getAnalysis: ReturnType<typeof vi.fn>;
  getDriftAlerts: ReturnType<typeof vi.fn>;
  generateAnalysis: ReturnType<typeof vi.fn>;
};

function makeBrandService(opts?: {
  analysisResult?: BrandAnalysisResult | null | Error;
  driftResult?: DriftAnalysisResult | Error;
  generateError?: Error;
}): MockBrandService {
  return {
    getAnalysis: vi.fn().mockImplementation(async () => {
      if (opts && 'analysisResult' in opts) {
        const result = opts.analysisResult;
        if (result instanceof Error) throw result;
        return result;
      }
      return FIXTURE_BRAND_ANALYSIS_RESULT;
    }),
    getDriftAlerts: vi.fn().mockImplementation(async () => {
      if (opts?.driftResult instanceof Error) throw opts.driftResult;
      return opts?.driftResult ?? FIXTURE_DRIFT_RESULT;
    }),
    generateAnalysis: vi.fn().mockImplementation(async () => {
      if (opts?.generateError) throw opts.generateError;
    }),
  };
}

function buildApp(
  authService: ReturnType<typeof makeAuthService>,
  brandService: MockBrandService,
) {
  const app = express();
  app.use(express.json());
  app.use('/v1/brand', createBrandRouter(authService as never, brandService as never));
  return app;
}

// ---------------------------------------------------------------------------
// GET /v1/brand/analysis
// ---------------------------------------------------------------------------

describe('GET /v1/brand/analysis', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let brandService: MockBrandService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService();
    brandService = makeBrandService();
  });

  it('returns 200 with BrandAnalysisResult', async () => {
    const app = buildApp(authService, brandService);
    const res = await request(app)
      .get('/v1/brand/analysis')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('consistency_score', 72);
    expect(res.body).toHaveProperty('voice_profile');
    expect(res.body).toHaveProperty('positioning_themes');
    expect(res.body).toHaveProperty('sources');
    expect(res.body.voice_profile.tone).toBe('formal');
  });

  it('returns 404 when no analysis exists', async () => {
    const service = makeBrandService({ analysisResult: null });
    const app = buildApp(authService, service);
    const res = await request(app)
      .get('/v1/brand/analysis')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const app = buildApp(authService, brandService);
    const res = await request(app).get('/v1/brand/analysis');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeBrandService({ analysisResult: new Error('DB failure') });
    const app = buildApp(authService, service);
    const res = await request(app)
      .get('/v1/brand/analysis')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('passes workspace_id from JWT to getAnalysis', async () => {
    authService.verifyJwt.mockResolvedValue({ user_id: 'u1', workspace_id: 'ws-custom', role: 'viewer' });
    const app = buildApp(authService, brandService);
    await request(app)
      .get('/v1/brand/analysis')
      .set('Authorization', 'Bearer token');
    expect(brandService.getAnalysis).toHaveBeenCalledWith('ws-custom');
  });

  it('viewer role can access brand analysis', async () => {
    const app = buildApp(makeAuthService('viewer'), brandService);
    const res = await request(app)
      .get('/v1/brand/analysis')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/brand/drift
// ---------------------------------------------------------------------------

describe('GET /v1/brand/drift', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let brandService: MockBrandService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService();
    brandService = makeBrandService();
  });

  it('returns 200 with DriftAnalysisResult', async () => {
    const app = buildApp(authService, brandService);
    const res = await request(app)
      .get('/v1/brand/drift')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('alerts');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('consistency_baseline');
    expect(Array.isArray(res.body.alerts)).toBe(true);
  });

  it('returns empty alerts array when no analysis exists', async () => {
    const service = makeBrandService({
      driftResult: { alerts: [], total: 0, consistency_baseline: 0 },
    });
    const app = buildApp(authService, service);
    const res = await request(app)
      .get('/v1/brand/drift')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.alerts).toHaveLength(0);
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const app = buildApp(authService, brandService);
    const res = await request(app).get('/v1/brand/drift');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeBrandService({ driftResult: new Error('DB failure') });
    const app = buildApp(authService, service);
    const res = await request(app)
      .get('/v1/brand/drift')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('passes workspace_id from JWT to getDriftAlerts', async () => {
    authService.verifyJwt.mockResolvedValue({ user_id: 'u1', workspace_id: 'ws-drift', role: 'viewer' });
    const app = buildApp(authService, brandService);
    await request(app)
      .get('/v1/brand/drift')
      .set('Authorization', 'Bearer token');
    expect(brandService.getDriftAlerts).toHaveBeenCalledWith('ws-drift');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/brand/analyze
// ---------------------------------------------------------------------------

describe('POST /v1/brand/analyze', () => {
  let brandService: MockBrandService;

  beforeEach(() => {
    vi.clearAllMocks();
    brandService = makeBrandService();
  });

  it('returns 200 with success message for member role', async () => {
    const auth = makeAuthService('member');
    const app = buildApp(auth, brandService);
    const res = await request(app)
      .post('/v1/brand/analyze')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body.message).toContain('complete');
  });

  it('returns 403 for viewer role', async () => {
    const auth = makeAuthService('viewer');
    const app = buildApp(auth, brandService);
    const res = await request(app)
      .post('/v1/brand/analyze')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('returns 401 without JWT', async () => {
    const auth = makeAuthService('member');
    auth.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const app = buildApp(auth, brandService);
    const res = await request(app).post('/v1/brand/analyze');
    expect(res.status).toBe(401);
  });

  it('calls generateAnalysis with workspace_id from JWT', async () => {
    const auth = makeAuthService('member');
    auth.verifyJwt.mockResolvedValue({ user_id: 'u1', workspace_id: 'ws-analyze', role: 'member' });
    const app = buildApp(auth, brandService);
    await request(app)
      .post('/v1/brand/analyze')
      .set('Authorization', 'Bearer token');
    expect(brandService.generateAnalysis).toHaveBeenCalledWith('ws-analyze');
  });

  it('returns 500 on service error', async () => {
    const service = makeBrandService({ generateError: new Error('Analysis failure') });
    const auth = makeAuthService('member');
    const app = buildApp(auth, service);
    const res = await request(app)
      .post('/v1/brand/analyze')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Analysis failure');
  });

  it('admin role can trigger brand analysis', async () => {
    const auth = makeAuthService('admin');
    const app = buildApp(auth, brandService);
    const res = await request(app)
      .post('/v1/brand/analyze')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });
});
