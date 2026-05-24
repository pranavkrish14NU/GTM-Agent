/**
 * Integration tests for Analytics Dashboard routes.
 *
 * GET /v1/analytics/dimensions — viewer+, 401, 500
 * GET /v1/analytics/export     — viewer+, 400 on bad format, 401, 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { AnalyticsDimensionsResult, QbrExport } from '../src/services/analytics.service.js';
import { createAnalyticsRouter } from '../src/routes/analytics.js';
import { FIXTURE_ANALYTICS_RESULT, FIXTURE_QBR_EXPORT } from './fixtures/analytics.js';

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

type MockAnalyticsService = {
  getDimensions: ReturnType<typeof vi.fn>;
  exportQbr: ReturnType<typeof vi.fn>;
};

function makeAnalyticsService(opts?: {
  dimensionsResult?: AnalyticsDimensionsResult | Error;
  exportResult?: QbrExport | Error;
}): MockAnalyticsService {
  return {
    getDimensions: vi.fn().mockImplementation(async () => {
      if (opts && 'dimensionsResult' in opts) {
        const r = opts.dimensionsResult;
        if (r instanceof Error) throw r;
        return r;
      }
      return FIXTURE_ANALYTICS_RESULT;
    }),
    exportQbr: vi.fn().mockImplementation(async () => {
      if (opts && 'exportResult' in opts) {
        const r = opts.exportResult;
        if (r instanceof Error) throw r;
        return r;
      }
      return FIXTURE_QBR_EXPORT;
    }),
  };
}

function buildApp(
  authService: ReturnType<typeof makeAuthService>,
  analyticsService: MockAnalyticsService,
) {
  const app = express();
  app.use(express.json());
  app.use('/v1/analytics', createAnalyticsRouter(authService as never, analyticsService as never));
  return app;
}

// ---------------------------------------------------------------------------
// GET /v1/analytics/dimensions
// ---------------------------------------------------------------------------

describe('GET /v1/analytics/dimensions', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let analyticsService: MockAnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService('viewer');
    analyticsService = makeAnalyticsService();
  });

  it('returns 200 with analytics dimensions result', async () => {
    const res = await request(buildApp(authService, analyticsService))
      .get('/v1/analytics/dimensions')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('overall_health_score');
    expect(res.body).toHaveProperty('overall_trend');
    expect(res.body).toHaveProperty('dimensions');
    expect(res.body).toHaveProperty('priority_alerts');
    expect(res.body).toHaveProperty('last_analyzed_at');
    expect(Array.isArray(res.body.dimensions)).toBe(true);
  });

  it('dimensions include trend and narrative fields', async () => {
    const res = await request(buildApp(authService, analyticsService))
      .get('/v1/analytics/dimensions')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    const firstDim = res.body.dimensions[0];
    expect(firstDim).toHaveProperty('trend');
    expect(firstDim).toHaveProperty('score_delta');
    expect(firstDim).toHaveProperty('previous_score');
    expect(firstDim).toHaveProperty('narrative');
    expect(['improving', 'stable', 'declining']).toContain(firstDim.trend);
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(authService, analyticsService))
      .get('/v1/analytics/dimensions');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeAnalyticsService({ dimensionsResult: new Error('DB failure') });
    const res = await request(buildApp(authService, service))
      .get('/v1/analytics/dimensions')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('passes workspace_id to getDimensions', async () => {
    authService.verifyJwt.mockResolvedValue({
      user_id: 'u-xyz',
      workspace_id: 'ws-analytics',
      role: 'viewer',
    });
    await request(buildApp(authService, analyticsService))
      .get('/v1/analytics/dimensions')
      .set('Authorization', 'Bearer token');
    expect(analyticsService.getDimensions).toHaveBeenCalledWith('ws-analytics');
  });

  it('viewer role can access dimensions', async () => {
    const auth = makeAuthService('viewer');
    const res = await request(buildApp(auth, analyticsService))
      .get('/v1/analytics/dimensions')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });

  it('admin role can access dimensions', async () => {
    const auth = makeAuthService('admin');
    const res = await request(buildApp(auth, analyticsService))
      .get('/v1/analytics/dimensions')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/analytics/export
// ---------------------------------------------------------------------------

describe('GET /v1/analytics/export', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let analyticsService: MockAnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService('viewer');
    analyticsService = makeAnalyticsService();
  });

  it('returns 200 with QBR export for pdf format', async () => {
    const res = await request(buildApp(authService, analyticsService))
      .get('/v1/analytics/export?format=pdf')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('format', 'pdf');
    expect(res.body).toHaveProperty('content');
    expect(res.body).toHaveProperty('filename');
    expect(res.body).toHaveProperty('generated_at');
  });

  it('returns 200 with QBR export for markdown format', async () => {
    const mdExport = { ...FIXTURE_QBR_EXPORT, format: 'markdown' as const, filename: 'GTM-QBR-2026-05-24.md' };
    const service = makeAnalyticsService({ exportResult: mdExport });

    const res = await request(buildApp(authService, service))
      .get('/v1/analytics/export?format=markdown')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.format).toBe('markdown');
  });

  it('defaults to markdown when no format specified', async () => {
    await request(buildApp(authService, analyticsService))
      .get('/v1/analytics/export')
      .set('Authorization', 'Bearer token');

    expect(analyticsService.exportQbr).toHaveBeenCalledWith('ws-001', 'markdown');
  });

  it('returns 400 for unsupported format', async () => {
    const res = await request(buildApp(authService, analyticsService))
      .get('/v1/analytics/export?format=word')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('format');
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(authService, analyticsService))
      .get('/v1/analytics/export?format=pdf');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeAnalyticsService({ exportResult: new Error('Export failed') });
    const res = await request(buildApp(authService, service))
      .get('/v1/analytics/export?format=pdf')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Export failed');
  });

  it('passes workspace_id and format to exportQbr', async () => {
    authService.verifyJwt.mockResolvedValue({
      user_id: 'u1',
      workspace_id: 'ws-qbr',
      role: 'viewer',
    });
    await request(buildApp(authService, analyticsService))
      .get('/v1/analytics/export?format=pdf')
      .set('Authorization', 'Bearer token');

    expect(analyticsService.exportQbr).toHaveBeenCalledWith('ws-qbr', 'pdf');
  });

  it('viewer role can export', async () => {
    const auth = makeAuthService('viewer');
    const res = await request(buildApp(auth, analyticsService))
      .get('/v1/analytics/export?format=pdf')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });
});
