/**
 * Integration tests for Competitor Intelligence routes.
 *
 * GET /v1/competitors
 *   - 200 with CompetitorSummary array
 *   - 200 with empty array when no data
 *   - 401 without JWT
 *   - 500 on service error
 *
 * GET /v1/competitors/:id/battlecard
 *   - 200 with BattlecardResult
 *   - 404 when not found
 *   - 401 without JWT
 *   - 500 on service error
 *
 * POST /v1/competitors/analyze
 *   - 200 with success message for member role
 *   - 403 for viewer role
 *   - 401 without JWT
 *   - 500 on service error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { BattlecardResult, CompetitorSummary } from '../src/services/competitor.service.js';
import { createCompetitorRouter } from '../src/routes/competitors.js';
import {
  FIXTURE_BATTLECARD_SALESFORCE,
  FIXTURE_ALL_COMPETITORS_SUMMARY,
} from './fixtures/competitor.js';

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

type MockCompetitorService = {
  getCompetitors: ReturnType<typeof vi.fn>;
  getBattlecard: ReturnType<typeof vi.fn>;
  generateBattlecards: ReturnType<typeof vi.fn>;
};

function makeCompetitorService(opts?: {
  competitorsResult?: CompetitorSummary[] | Error;
  battlecardResult?: BattlecardResult | null | Error;
  generateError?: Error;
}): MockCompetitorService {
  return {
    getCompetitors: vi.fn().mockImplementation(async () => {
      if (opts?.competitorsResult instanceof Error) throw opts.competitorsResult;
      return opts?.competitorsResult ?? FIXTURE_ALL_COMPETITORS_SUMMARY;
    }),
    getBattlecard: vi.fn().mockImplementation(async () => {
      if (opts && 'battlecardResult' in opts) {
        const result = opts.battlecardResult;
        if (result instanceof Error) throw result;
        return result;
      }
      return FIXTURE_BATTLECARD_SALESFORCE;
    }),
    generateBattlecards: vi.fn().mockImplementation(async () => {
      if (opts?.generateError) throw opts.generateError;
    }),
  };
}

function buildApp(
  authService: ReturnType<typeof makeAuthService>,
  competitorService: MockCompetitorService,
) {
  const app = express();
  app.use(express.json());
  app.use('/v1/competitors', createCompetitorRouter(authService as never, competitorService as never));
  return app;
}

// ---------------------------------------------------------------------------
// GET /v1/competitors
// ---------------------------------------------------------------------------

describe('GET /v1/competitors', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let competitorService: MockCompetitorService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService();
    competitorService = makeCompetitorService();
  });

  it('returns 200 with CompetitorSummary array', async () => {
    const app = buildApp(authService, competitorService);
    const res = await request(app)
      .get('/v1/competitors')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty('competitor_name');
    expect(res.body[0]).toHaveProperty('threat_score');
    expect(res.body[0]).toHaveProperty('confidence_level');
  });

  it('returns 200 with empty array when no competitors exist', async () => {
    const service = makeCompetitorService({ competitorsResult: [] });
    const app = buildApp(authService, service);
    const res = await request(app)
      .get('/v1/competitors')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const app = buildApp(authService, competitorService);
    const res = await request(app).get('/v1/competitors');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeCompetitorService({ competitorsResult: new Error('DB failure') });
    const app = buildApp(authService, service);
    const res = await request(app)
      .get('/v1/competitors')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('passes workspace_id from JWT to getCompetitors', async () => {
    authService.verifyJwt.mockResolvedValue({ user_id: 'u1', workspace_id: 'ws-comp', role: 'viewer' });
    const app = buildApp(authService, competitorService);
    await request(app)
      .get('/v1/competitors')
      .set('Authorization', 'Bearer token');
    expect(competitorService.getCompetitors).toHaveBeenCalledWith('ws-comp');
  });

  it('viewer role can list competitors', async () => {
    const app = buildApp(makeAuthService('viewer'), competitorService);
    const res = await request(app)
      .get('/v1/competitors')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/competitors/:id/battlecard
// ---------------------------------------------------------------------------

describe('GET /v1/competitors/:id/battlecard', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let competitorService: MockCompetitorService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService();
    competitorService = makeCompetitorService();
  });

  it('returns 200 with BattlecardResult', async () => {
    const app = buildApp(authService, competitorService);
    const res = await request(app)
      .get('/v1/competitors/ins-comp-001/battlecard')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('competitor_name', 'Salesforce');
    expect(res.body).toHaveProperty('threat_score');
    expect(res.body).toHaveProperty('differentiation_matrix');
    expect(res.body).toHaveProperty('counter_messages');
    expect(res.body).toHaveProperty('messaging_comparison');
  });

  it('returns 404 when battlecard not found', async () => {
    const service = makeCompetitorService({ battlecardResult: null });
    const app = buildApp(authService, service);
    const res = await request(app)
      .get('/v1/competitors/nonexistent/battlecard')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const app = buildApp(authService, competitorService);
    const res = await request(app).get('/v1/competitors/ins-001/battlecard');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeCompetitorService({ battlecardResult: new Error('DB failure') });
    const app = buildApp(authService, service);
    const res = await request(app)
      .get('/v1/competitors/ins-001/battlecard')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('passes workspace_id and id to getBattlecard', async () => {
    authService.verifyJwt.mockResolvedValue({ user_id: 'u1', workspace_id: 'ws-comp', role: 'viewer' });
    const app = buildApp(authService, competitorService);
    await request(app)
      .get('/v1/competitors/ins-comp-001/battlecard')
      .set('Authorization', 'Bearer token');
    expect(competitorService.getBattlecard).toHaveBeenCalledWith('ws-comp', 'ins-comp-001');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/competitors/analyze
// ---------------------------------------------------------------------------

describe('POST /v1/competitors/analyze', () => {
  let competitorService: MockCompetitorService;

  beforeEach(() => {
    vi.clearAllMocks();
    competitorService = makeCompetitorService();
  });

  it('returns 200 with success message for member role', async () => {
    const auth = makeAuthService('member');
    const app = buildApp(auth, competitorService);
    const res = await request(app)
      .post('/v1/competitors/analyze')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body.message).toContain('complete');
  });

  it('returns 403 for viewer role', async () => {
    const auth = makeAuthService('viewer');
    const app = buildApp(auth, competitorService);
    const res = await request(app)
      .post('/v1/competitors/analyze')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('returns 401 without JWT', async () => {
    const auth = makeAuthService('member');
    auth.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const app = buildApp(auth, competitorService);
    const res = await request(app).post('/v1/competitors/analyze');
    expect(res.status).toBe(401);
  });

  it('calls generateBattlecards with workspace_id from JWT', async () => {
    const auth = makeAuthService('member');
    auth.verifyJwt.mockResolvedValue({ user_id: 'u1', workspace_id: 'ws-analyze', role: 'member' });
    const app = buildApp(auth, competitorService);
    await request(app)
      .post('/v1/competitors/analyze')
      .set('Authorization', 'Bearer token');
    expect(competitorService.generateBattlecards).toHaveBeenCalledWith('ws-analyze');
  });

  it('returns 500 on service error', async () => {
    const service = makeCompetitorService({ generateError: new Error('Generation failure') });
    const auth = makeAuthService('member');
    const app = buildApp(auth, service);
    const res = await request(app)
      .post('/v1/competitors/analyze')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Generation failure');
  });

  it('admin role can trigger battlecard generation', async () => {
    const auth = makeAuthService('admin');
    const app = buildApp(auth, competitorService);
    const res = await request(app)
      .post('/v1/competitors/analyze')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });
});
