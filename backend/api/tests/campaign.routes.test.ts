/**
 * Integration tests for Campaign Planner routes.
 *
 * GET  /v1/campaigns             — paginated list, 401, 500
 * GET  /v1/campaigns/:id         — single brief, 404, 401, 500
 * POST /v1/campaigns/generate    — member+ only, 400, 401, 403, 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { CampaignBrief } from '../src/services/campaign.service.js';
import { createCampaignRouter } from '../src/routes/campaigns.js';
import {
  FIXTURE_CAMPAIGN_BRIEF,
  FIXTURE_CAMPAIGN_LIST_RESULT,
} from './fixtures/campaign.js';

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

type MockCampaignService = {
  getCampaigns: ReturnType<typeof vi.fn>;
  getCampaign: ReturnType<typeof vi.fn>;
  generateCampaign: ReturnType<typeof vi.fn>;
};

function makeCampaignService(opts?: {
  listResult?: typeof FIXTURE_CAMPAIGN_LIST_RESULT | Error;
  briefResult?: CampaignBrief | null | Error;
  generateResult?: CampaignBrief | Error;
}): MockCampaignService {
  return {
    getCampaigns: vi.fn().mockImplementation(async () => {
      if (opts && 'listResult' in opts) {
        const r = opts.listResult;
        if (r instanceof Error) throw r;
        return r;
      }
      return FIXTURE_CAMPAIGN_LIST_RESULT;
    }),
    getCampaign: vi.fn().mockImplementation(async () => {
      if (opts && 'briefResult' in opts) {
        const r = opts.briefResult;
        if (r instanceof Error) throw r;
        return r;
      }
      return FIXTURE_CAMPAIGN_BRIEF;
    }),
    generateCampaign: vi.fn().mockImplementation(async () => {
      if (opts && 'generateResult' in opts) {
        const r = opts.generateResult;
        if (r instanceof Error) throw r;
        return r;
      }
      return FIXTURE_CAMPAIGN_BRIEF;
    }),
  };
}

function buildApp(
  authService: ReturnType<typeof makeAuthService>,
  campaignService: MockCampaignService,
) {
  const app = express();
  app.use(express.json());
  app.use('/v1/campaigns', createCampaignRouter(authService as never, campaignService as never));
  return app;
}

const VALID_GENERATE_BODY = {
  name: 'Q2 Enterprise Pipeline Campaign',
  objective: 'Drive 50 qualified enterprise demos in Q2',
  targetPersonas: ['VP of Sales', 'Revenue Operations'],
  channels: ['email', 'linkedin'],
  duration: '90 days',
};

// ---------------------------------------------------------------------------
// GET /v1/campaigns
// ---------------------------------------------------------------------------

describe('GET /v1/campaigns', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let campaignService: MockCampaignService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService('viewer');
    campaignService = makeCampaignService();
  });

  it('returns 200 with paginated campaign summaries', async () => {
    const res = await request(buildApp(authService, campaignService))
      .get('/v1/campaigns')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('page_size');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('passes workspace_id to getCampaigns', async () => {
    authService.verifyJwt.mockResolvedValue({
      user_id: 'u-xyz',
      workspace_id: 'ws-abc',
      role: 'viewer',
    });

    await request(buildApp(authService, campaignService))
      .get('/v1/campaigns')
      .set('Authorization', 'Bearer token');

    expect(campaignService.getCampaigns).toHaveBeenCalledWith('ws-abc', 1, 20);
  });

  it('applies page and page_size query params', async () => {
    await request(buildApp(authService, campaignService))
      .get('/v1/campaigns?page=3&page_size=10')
      .set('Authorization', 'Bearer token');

    expect(campaignService.getCampaigns).toHaveBeenCalledWith('ws-001', 3, 10);
  });

  it('clamps page to minimum 1', async () => {
    await request(buildApp(authService, campaignService))
      .get('/v1/campaigns?page=0')
      .set('Authorization', 'Bearer token');

    const call = campaignService.getCampaigns.mock.calls[0]!;
    expect(call[1]).toBe(1);
  });

  it('clamps page_size to maximum 100', async () => {
    await request(buildApp(authService, campaignService))
      .get('/v1/campaigns?page_size=999')
      .set('Authorization', 'Bearer token');

    const call = campaignService.getCampaigns.mock.calls[0]!;
    expect(call[2]).toBe(100);
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(authService, campaignService))
      .get('/v1/campaigns');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeCampaignService({ listResult: new Error('DB failure') });
    const res = await request(buildApp(authService, service))
      .get('/v1/campaigns')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('viewer role can list campaigns', async () => {
    const auth = makeAuthService('viewer');
    const res = await request(buildApp(auth, campaignService))
      .get('/v1/campaigns')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/campaigns/:id
// ---------------------------------------------------------------------------

describe('GET /v1/campaigns/:id', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let campaignService: MockCampaignService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService('viewer');
    campaignService = makeCampaignService();
  });

  it('returns 200 with full campaign brief', async () => {
    const res = await request(buildApp(authService, campaignService))
      .get('/v1/campaigns/campaign-001')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('objective');
    expect(res.body).toHaveProperty('email_sequence');
    expect(res.body).toHaveProperty('ad_copy');
    expect(res.body).toHaveProperty('executive_summary');
    expect(res.body).toHaveProperty('source_citations');
    expect(res.body).toHaveProperty('channel_recommendations');
    expect(res.body).toHaveProperty('content_plan');
  });

  it('returns 404 when campaign not found', async () => {
    const service = makeCampaignService({ briefResult: null });
    const res = await request(buildApp(authService, service))
      .get('/v1/campaigns/nonexistent')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('passes workspace_id and campaign id to getCampaign', async () => {
    await request(buildApp(authService, campaignService))
      .get('/v1/campaigns/campaign-xyz')
      .set('Authorization', 'Bearer token');
    expect(campaignService.getCampaign).toHaveBeenCalledWith('ws-001', 'campaign-xyz');
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(authService, campaignService))
      .get('/v1/campaigns/campaign-001');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeCampaignService({ briefResult: new Error('DB failure') });
    const res = await request(buildApp(authService, service))
      .get('/v1/campaigns/campaign-001')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/campaigns/generate
// ---------------------------------------------------------------------------

describe('POST /v1/campaigns/generate', () => {
  let campaignService: MockCampaignService;

  beforeEach(() => {
    vi.clearAllMocks();
    campaignService = makeCampaignService();
  });

  it('returns 201 with generated campaign brief for member role', async () => {
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, campaignService))
      .post('/v1/campaigns/generate')
      .set('Authorization', 'Bearer token')
      .send(VALID_GENERATE_BODY);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('objective');
    expect(res.body).toHaveProperty('email_sequence');
    expect(res.body).toHaveProperty('ad_copy');
    expect(res.body).toHaveProperty('executive_summary');
    expect(res.body).toHaveProperty('source_citations');
  });

  it('returns 403 for viewer role', async () => {
    const auth = makeAuthService('viewer');
    const res = await request(buildApp(auth, campaignService))
      .post('/v1/campaigns/generate')
      .set('Authorization', 'Bearer token')
      .send(VALID_GENERATE_BODY);
    expect(res.status).toBe(403);
  });

  it('returns 401 without JWT', async () => {
    const auth = makeAuthService('member');
    auth.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(auth, campaignService))
      .post('/v1/campaigns/generate')
      .send(VALID_GENERATE_BODY);
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    const auth = makeAuthService('member');
    const { name: _n, ...body } = VALID_GENERATE_BODY;
    const res = await request(buildApp(auth, campaignService))
      .post('/v1/campaigns/generate')
      .set('Authorization', 'Bearer token')
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('name');
  });

  it('returns 400 when objective is missing', async () => {
    const auth = makeAuthService('member');
    const { objective: _o, ...body } = VALID_GENERATE_BODY;
    const res = await request(buildApp(auth, campaignService))
      .post('/v1/campaigns/generate')
      .set('Authorization', 'Bearer token')
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('objective');
  });

  it('returns 400 when duration is missing', async () => {
    const auth = makeAuthService('member');
    const { duration: _d, ...body } = VALID_GENERATE_BODY;
    const res = await request(buildApp(auth, campaignService))
      .post('/v1/campaigns/generate')
      .set('Authorization', 'Bearer token')
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('duration');
  });

  it('returns 400 when targetPersonas is not an array', async () => {
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, campaignService))
      .post('/v1/campaigns/generate')
      .set('Authorization', 'Bearer token')
      .send({ ...VALID_GENERATE_BODY, targetPersonas: 'VP of Sales' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('targetPersonas');
  });

  it('returns 400 when channels is not an array', async () => {
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, campaignService))
      .post('/v1/campaigns/generate')
      .set('Authorization', 'Bearer token')
      .send({ ...VALID_GENERATE_BODY, channels: 'email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('channels');
  });

  it('returns 400 when channels is empty array', async () => {
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, campaignService))
      .post('/v1/campaigns/generate')
      .set('Authorization', 'Bearer token')
      .send({ ...VALID_GENERATE_BODY, channels: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('channels');
  });

  it('passes workspace_id and body to generateCampaign', async () => {
    const auth = makeAuthService('member');
    auth.verifyJwt.mockResolvedValue({ user_id: 'u1', workspace_id: 'ws-gen', role: 'member' });

    await request(buildApp(auth, campaignService))
      .post('/v1/campaigns/generate')
      .set('Authorization', 'Bearer token')
      .send(VALID_GENERATE_BODY);

    expect(campaignService.generateCampaign).toHaveBeenCalledWith(
      'ws-gen',
      expect.objectContaining({
        name: 'Q2 Enterprise Pipeline Campaign',
        objective: 'Drive 50 qualified enterprise demos in Q2',
        channels: ['email', 'linkedin'],
      }),
    );
  });

  it('admin role can generate campaigns', async () => {
    const auth = makeAuthService('admin');
    const res = await request(buildApp(auth, campaignService))
      .post('/v1/campaigns/generate')
      .set('Authorization', 'Bearer token')
      .send(VALID_GENERATE_BODY);
    expect(res.status).toBe(201);
  });

  it('returns 500 on service error', async () => {
    const service = makeCampaignService({ generateResult: new Error('LLM timeout') });
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, service))
      .post('/v1/campaigns/generate')
      .set('Authorization', 'Bearer token')
      .send(VALID_GENERATE_BODY);
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('LLM timeout');
  });

  it('accepts optional budget and additionalContext fields', async () => {
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, campaignService))
      .post('/v1/campaigns/generate')
      .set('Authorization', 'Bearer token')
      .send({ ...VALID_GENERATE_BODY, budget: '$50,000', additionalContext: 'Focus on EMEA' });
    expect(res.status).toBe(201);
  });
});
