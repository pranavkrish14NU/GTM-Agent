/**
 * Integration tests for Win/Loss Analysis routes.
 *
 * GET /v1/winloss/patterns — deal patterns, 404 when no data, 401, 500
 * GET /v1/winloss/objections — objection analysis, 404, 401, 500
 * GET /v1/winloss/competitors — competitor involvement, 404, 401, 500
 * POST /v1/winloss/analyze — member+ only, 403, 401, 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { WinLossAnalysisResult } from '../src/services/winloss.service.js';
import { createWinLossRouter } from '../src/routes/winloss.js';
import { FIXTURE_WINLOSS_RESULT } from './fixtures/winloss.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeAuthService(role = 'viewer') {
  return {
    verifyJwt: vi.fn().mockResolvedValue({ user_id: 'user-001', workspace_id: 'ws-001', role }),
  };
}

type MockWinLossService = {
  getAnalysis: ReturnType<typeof vi.fn>;
  generateAnalysis: ReturnType<typeof vi.fn>;
};

function makeWinLossService(opts?: {
  analysisResult?: WinLossAnalysisResult | null | Error;
  generateError?: Error;
}): MockWinLossService {
  return {
    getAnalysis: vi.fn().mockImplementation(async () => {
      if (opts && 'analysisResult' in opts) {
        const r = opts.analysisResult;
        if (r instanceof Error) throw r;
        return r;
      }
      return FIXTURE_WINLOSS_RESULT;
    }),
    generateAnalysis: vi.fn().mockImplementation(async () => {
      if (opts?.generateError) throw opts.generateError;
    }),
  };
}

function buildApp(
  authService: ReturnType<typeof makeAuthService>,
  winLossService: MockWinLossService,
) {
  const app = express();
  app.use(express.json());
  app.use('/v1/winloss', createWinLossRouter(authService as never, winLossService as never));
  return app;
}

// ---------------------------------------------------------------------------
// GET /v1/winloss/patterns
// ---------------------------------------------------------------------------

describe('GET /v1/winloss/patterns', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let winLossService: MockWinLossService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService();
    winLossService = makeWinLossService();
  });

  it('returns 200 with deal patterns', async () => {
    const res = await request(buildApp(authService, winLossService))
      .get('/v1/winloss/patterns')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('deal_patterns');
    expect(res.body.deal_patterns).toHaveProperty('win_factors');
    expect(res.body.deal_patterns).toHaveProperty('loss_factors');
    expect(res.body.deal_patterns).toHaveProperty('win_rate');
    expect(res.body).toHaveProperty('corrective_actions');
  });

  it('returns 404 when no analysis exists', async () => {
    const service = makeWinLossService({ analysisResult: null });
    const res = await request(buildApp(authService, service))
      .get('/v1/winloss/patterns')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(authService, winLossService))
      .get('/v1/winloss/patterns');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeWinLossService({ analysisResult: new Error('DB failure') });
    const res = await request(buildApp(authService, service))
      .get('/v1/winloss/patterns')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
  });

  it('passes workspace_id to getAnalysis', async () => {
    authService.verifyJwt.mockResolvedValue({ user_id: 'u1', workspace_id: 'ws-wl', role: 'viewer' });
    await request(buildApp(authService, winLossService))
      .get('/v1/winloss/patterns')
      .set('Authorization', 'Bearer token');
    expect(winLossService.getAnalysis).toHaveBeenCalledWith('ws-wl');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/winloss/objections
// ---------------------------------------------------------------------------

describe('GET /v1/winloss/objections', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let winLossService: MockWinLossService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService();
    winLossService = makeWinLossService();
  });

  it('returns 200 with objection analysis', async () => {
    const res = await request(buildApp(authService, winLossService))
      .get('/v1/winloss/objections')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('objection_analysis');
    expect(res.body.objection_analysis).toHaveProperty('top_objections');
    expect(res.body.objection_analysis).toHaveProperty('total_objections_found');
    expect(Array.isArray(res.body.objection_analysis.top_objections)).toBe(true);
  });

  it('top_objections include persona_correlation', async () => {
    const res = await request(buildApp(authService, winLossService))
      .get('/v1/winloss/objections')
      .set('Authorization', 'Bearer token');

    const first = res.body.objection_analysis.top_objections[0];
    expect(first).toHaveProperty('persona_correlation');
    expect(Array.isArray(first.persona_correlation)).toBe(true);
  });

  it('returns 404 when no analysis exists', async () => {
    const service = makeWinLossService({ analysisResult: null });
    const res = await request(buildApp(authService, service))
      .get('/v1/winloss/objections')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(404);
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(authService, winLossService))
      .get('/v1/winloss/objections');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeWinLossService({ analysisResult: new Error('DB failure') });
    const res = await request(buildApp(authService, service))
      .get('/v1/winloss/objections')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/winloss/competitors
// ---------------------------------------------------------------------------

describe('GET /v1/winloss/competitors', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let winLossService: MockWinLossService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService();
    winLossService = makeWinLossService();
  });

  it('returns 200 with competitor involvement', async () => {
    const res = await request(buildApp(authService, winLossService))
      .get('/v1/winloss/competitors')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('competitor_involvement');
    expect(res.body.competitor_involvement).toHaveProperty('records');
    expect(res.body.competitor_involvement).toHaveProperty('total_competitive_deals');
  });

  it('competitor records include win_rate and corrective_action', async () => {
    const res = await request(buildApp(authService, winLossService))
      .get('/v1/winloss/competitors')
      .set('Authorization', 'Bearer token');

    const first = res.body.competitor_involvement.records[0];
    expect(first).toHaveProperty('win_rate');
    expect(first).toHaveProperty('corrective_action');
    expect(first).toHaveProperty('competitor_name');
  });

  it('returns 404 when no analysis exists', async () => {
    const service = makeWinLossService({ analysisResult: null });
    const res = await request(buildApp(authService, service))
      .get('/v1/winloss/competitors')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(404);
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(authService, winLossService))
      .get('/v1/winloss/competitors');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeWinLossService({ analysisResult: new Error('DB failure') });
    const res = await request(buildApp(authService, service))
      .get('/v1/winloss/competitors')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/winloss/analyze
// ---------------------------------------------------------------------------

describe('POST /v1/winloss/analyze', () => {
  let winLossService: MockWinLossService;

  beforeEach(() => {
    vi.clearAllMocks();
    winLossService = makeWinLossService();
  });

  it('returns 200 with success message for member role', async () => {
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, winLossService))
      .post('/v1/winloss/analyze')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('complete');
  });

  it('returns 403 for viewer role', async () => {
    const auth = makeAuthService('viewer');
    const res = await request(buildApp(auth, winLossService))
      .post('/v1/winloss/analyze')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('returns 401 without JWT', async () => {
    const auth = makeAuthService('member');
    auth.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(auth, winLossService))
      .post('/v1/winloss/analyze');
    expect(res.status).toBe(401);
  });

  it('calls generateAnalysis with workspace_id', async () => {
    const auth = makeAuthService('member');
    auth.verifyJwt.mockResolvedValue({ user_id: 'u1', workspace_id: 'ws-wl', role: 'member' });
    await request(buildApp(auth, winLossService))
      .post('/v1/winloss/analyze')
      .set('Authorization', 'Bearer token');
    expect(winLossService.generateAnalysis).toHaveBeenCalledWith('ws-wl');
  });

  it('returns 500 on service error', async () => {
    const service = makeWinLossService({ generateError: new Error('Analysis failure') });
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, service))
      .post('/v1/winloss/analyze')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Analysis failure');
  });

  it('admin role can trigger analysis', async () => {
    const auth = makeAuthService('admin');
    const res = await request(buildApp(auth, winLossService))
      .post('/v1/winloss/analyze')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });
});
