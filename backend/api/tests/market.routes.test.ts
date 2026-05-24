/**
 * Integration tests for Market Intelligence routes.
 *
 * GET  /v1/market/trends   — viewer+, 404 no data, 401, 500
 * GET  /v1/market/brief    — viewer+, 404 no data, 401, 500
 * POST /v1/market/analyze  — member+, 401, 403, 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { MarketIntelligenceResult, MarketBrief } from '../src/services/market.service.js';
import { createMarketRouter } from '../src/routes/market.js';
import {
  FIXTURE_MARKET_INTELLIGENCE,
  FIXTURE_MARKET_BRIEF,
} from './fixtures/market.js';

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

type MockMarketService = {
  getTrends: ReturnType<typeof vi.fn>;
  getBrief: ReturnType<typeof vi.fn>;
  analyzeDocuments: ReturnType<typeof vi.fn>;
};

function makeMarketService(opts?: {
  trendsResult?: MarketIntelligenceResult | null | Error;
  briefResult?: MarketBrief | null | Error;
  analyzeResult?: MarketIntelligenceResult | Error;
}): MockMarketService {
  return {
    getTrends: vi.fn().mockImplementation(async () => {
      if (opts && 'trendsResult' in opts) {
        const r = opts.trendsResult;
        if (r instanceof Error) throw r;
        return r;
      }
      return FIXTURE_MARKET_INTELLIGENCE;
    }),
    getBrief: vi.fn().mockImplementation(async () => {
      if (opts && 'briefResult' in opts) {
        const r = opts.briefResult;
        if (r instanceof Error) throw r;
        return r;
      }
      return FIXTURE_MARKET_BRIEF;
    }),
    analyzeDocuments: vi.fn().mockImplementation(async () => {
      if (opts && 'analyzeResult' in opts) {
        const r = opts.analyzeResult;
        if (r instanceof Error) throw r;
        return r;
      }
      return FIXTURE_MARKET_INTELLIGENCE;
    }),
  };
}

function buildApp(
  authService: ReturnType<typeof makeAuthService>,
  marketService: MockMarketService,
) {
  const app = express();
  app.use(express.json());
  app.use('/v1/market', createMarketRouter(authService as never, marketService as never));
  return app;
}

// ---------------------------------------------------------------------------
// GET /v1/market/trends
// ---------------------------------------------------------------------------

describe('GET /v1/market/trends', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let marketService: MockMarketService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService('viewer');
    marketService = makeMarketService();
  });

  it('returns 200 with market intelligence result', async () => {
    const res = await request(buildApp(authService, marketService))
      .get('/v1/market/trends')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('trends');
    expect(res.body).toHaveProperty('sentiment');
    expect(res.body).toHaveProperty('emerging_topics');
    expect(res.body).toHaveProperty('document_count');
    expect(res.body).toHaveProperty('source_citations');
    expect(res.body).toHaveProperty('analyzed_at');
    expect(Array.isArray(res.body.trends)).toBe(true);
  });

  it('returns 404 when no market intelligence exists', async () => {
    const service = makeMarketService({ trendsResult: null });
    const res = await request(buildApp(authService, service))
      .get('/v1/market/trends')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(authService, marketService))
      .get('/v1/market/trends');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeMarketService({ trendsResult: new Error('DB failure') });
    const res = await request(buildApp(authService, service))
      .get('/v1/market/trends')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('passes workspace_id to getTrends', async () => {
    authService.verifyJwt.mockResolvedValue({
      user_id: 'u-xyz',
      workspace_id: 'ws-abc',
      role: 'viewer',
    });
    await request(buildApp(authService, marketService))
      .get('/v1/market/trends')
      .set('Authorization', 'Bearer token');
    expect(marketService.getTrends).toHaveBeenCalledWith('ws-abc');
  });

  it('viewer role can access trends', async () => {
    const auth = makeAuthService('viewer');
    const res = await request(buildApp(auth, marketService))
      .get('/v1/market/trends')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/market/brief
// ---------------------------------------------------------------------------

describe('GET /v1/market/brief', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let marketService: MockMarketService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService('viewer');
    marketService = makeMarketService();
  });

  it('returns 200 with market brief', async () => {
    const res = await request(buildApp(authService, marketService))
      .get('/v1/market/brief')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('brief_text');
    expect(res.body).toHaveProperty('trends');
    expect(res.body).toHaveProperty('sentiment');
    expect(res.body).toHaveProperty('emerging_topics');
    expect(res.body).toHaveProperty('source_citations');
    expect(res.body).toHaveProperty('generated_at');
  });

  it('returns 404 when brief cannot be generated', async () => {
    const service = makeMarketService({ briefResult: null });
    const res = await request(buildApp(authService, service))
      .get('/v1/market/brief')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(authService, marketService))
      .get('/v1/market/brief');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeMarketService({ briefResult: new Error('LLM failure') });
    const res = await request(buildApp(authService, service))
      .get('/v1/market/brief')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('LLM failure');
  });

  it('passes workspace_id to getBrief', async () => {
    authService.verifyJwt.mockResolvedValue({
      user_id: 'u-xyz',
      workspace_id: 'ws-mkt',
      role: 'viewer',
    });
    await request(buildApp(authService, marketService))
      .get('/v1/market/brief')
      .set('Authorization', 'Bearer token');
    expect(marketService.getBrief).toHaveBeenCalledWith('ws-mkt');
  });

  it('viewer role can access brief', async () => {
    const auth = makeAuthService('viewer');
    const res = await request(buildApp(auth, marketService))
      .get('/v1/market/brief')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/market/analyze
// ---------------------------------------------------------------------------

describe('POST /v1/market/analyze', () => {
  let marketService: MockMarketService;

  beforeEach(() => {
    vi.clearAllMocks();
    marketService = makeMarketService();
  });

  it('returns 200 with analysis result for member role', async () => {
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, marketService))
      .post('/v1/market/analyze')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('result');
    expect(res.body.result).toHaveProperty('id');
    expect(res.body.result).toHaveProperty('trends');
    expect(res.body.result).toHaveProperty('sentiment');
  });

  it('returns 403 for viewer role', async () => {
    const auth = makeAuthService('viewer');
    const res = await request(buildApp(auth, marketService))
      .post('/v1/market/analyze')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('returns 401 without JWT', async () => {
    const auth = makeAuthService('member');
    auth.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(auth, marketService))
      .post('/v1/market/analyze');
    expect(res.status).toBe(401);
  });

  it('passes workspace_id to analyzeDocuments', async () => {
    const auth = makeAuthService('member');
    auth.verifyJwt.mockResolvedValue({
      user_id: 'u1',
      workspace_id: 'ws-analyze',
      role: 'member',
    });
    await request(buildApp(auth, marketService))
      .post('/v1/market/analyze')
      .set('Authorization', 'Bearer token');
    expect(marketService.analyzeDocuments).toHaveBeenCalledWith('ws-analyze');
  });

  it('admin role can trigger analysis', async () => {
    const auth = makeAuthService('admin');
    const res = await request(buildApp(auth, marketService))
      .post('/v1/market/analyze')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });

  it('returns 500 on service error', async () => {
    const service = makeMarketService({ analyzeResult: new Error('LLM timeout') });
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, service))
      .post('/v1/market/analyze')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('LLM timeout');
  });
});
