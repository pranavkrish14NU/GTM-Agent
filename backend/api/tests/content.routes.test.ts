/**
 * Integration tests for Content Generation routes.
 *
 * GET  /v1/content/drafts          — paginated list, 401, 500
 * GET  /v1/content/drafts/:id      — single draft, 404, 401, 500
 * POST /v1/content/generate        — member+ only, 400, 401, 403, 500
 * PUT  /v1/content/drafts/:id      — member+ only, 400, 404, 401, 403, 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { ContentDraft, ContentDraftListResult } from '../src/services/content.service.js';
import { createContentRouter } from '../src/routes/content.js';
import {
  FIXTURE_DRAFT_BLOG,
  FIXTURE_DRAFT_LIST_RESULT,
} from './fixtures/content.js';

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

type MockContentService = {
  getDrafts: ReturnType<typeof vi.fn>;
  getDraft: ReturnType<typeof vi.fn>;
  generateContent: ReturnType<typeof vi.fn>;
  refineDraft: ReturnType<typeof vi.fn>;
};

function makeContentService(opts?: {
  listResult?: ContentDraftListResult | Error;
  draftResult?: ContentDraft | null | Error;
  generateResult?: ContentDraft | Error;
  refineResult?: ContentDraft | null | Error;
}): MockContentService {
  return {
    getDrafts: vi.fn().mockImplementation(async () => {
      if (opts && 'listResult' in opts) {
        const r = opts.listResult;
        if (r instanceof Error) throw r;
        return r;
      }
      return FIXTURE_DRAFT_LIST_RESULT;
    }),
    getDraft: vi.fn().mockImplementation(async () => {
      if (opts && 'draftResult' in opts) {
        const r = opts.draftResult;
        if (r instanceof Error) throw r;
        return r;
      }
      return FIXTURE_DRAFT_BLOG;
    }),
    generateContent: vi.fn().mockImplementation(async () => {
      if (opts && 'generateResult' in opts) {
        const r = opts.generateResult;
        if (r instanceof Error) throw r;
        return r;
      }
      return FIXTURE_DRAFT_BLOG;
    }),
    refineDraft: vi.fn().mockImplementation(async () => {
      if (opts && 'refineResult' in opts) {
        const r = opts.refineResult;
        if (r instanceof Error) throw r;
        return r;
      }
      return FIXTURE_DRAFT_BLOG;
    }),
  };
}

function buildApp(
  authService: ReturnType<typeof makeAuthService>,
  contentService: MockContentService,
) {
  const app = express();
  app.use(express.json());
  app.use('/v1/content', createContentRouter(authService as never, contentService as never));
  return app;
}

const VALID_GENERATE_BODY = {
  type: 'blog_post',
  topic: 'AI in Sales Enablement',
  tone: 'formal',
  length: 'medium',
  channel: 'company-blog',
};

// ---------------------------------------------------------------------------
// GET /v1/content/drafts
// ---------------------------------------------------------------------------

describe('GET /v1/content/drafts', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let contentService: MockContentService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService('viewer');
    contentService = makeContentService();
  });

  it('returns 200 with paginated drafts', async () => {
    const res = await request(buildApp(authService, contentService))
      .get('/v1/content/drafts')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('page_size');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('passes workspace_id and user_id to getDrafts', async () => {
    authService.verifyJwt.mockResolvedValue({
      user_id: 'u-xyz',
      workspace_id: 'ws-abc',
      role: 'viewer',
    });
    await request(buildApp(authService, contentService))
      .get('/v1/content/drafts')
      .set('Authorization', 'Bearer token');
    expect(contentService.getDrafts).toHaveBeenCalledWith('ws-abc', 'u-xyz', 1, 20);
  });

  it('applies query params for pagination', async () => {
    await request(buildApp(authService, contentService))
      .get('/v1/content/drafts?page=2&page_size=5')
      .set('Authorization', 'Bearer token');
    expect(contentService.getDrafts).toHaveBeenCalledWith('ws-001', 'user-001', 2, 5);
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(authService, contentService))
      .get('/v1/content/drafts');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeContentService({ listResult: new Error('DB failure') });
    const res = await request(buildApp(authService, service))
      .get('/v1/content/drafts')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/content/drafts/:id
// ---------------------------------------------------------------------------

describe('GET /v1/content/drafts/:id', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let contentService: MockContentService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService('viewer');
    contentService = makeContentService();
  });

  it('returns 200 with full draft', async () => {
    const res = await request(buildApp(authService, contentService))
      .get('/v1/content/drafts/draft-001')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('generated_text');
    expect(res.body).toHaveProperty('source_references');
    expect(res.body).toHaveProperty('brand_voice_score');
    expect(res.body).toHaveProperty('persona_fit_score');
  });

  it('returns 404 when draft not found', async () => {
    const service = makeContentService({ draftResult: null });
    const res = await request(buildApp(authService, service))
      .get('/v1/content/drafts/nonexistent')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(authService, contentService))
      .get('/v1/content/drafts/draft-001');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeContentService({ draftResult: new Error('DB failure') });
    const res = await request(buildApp(authService, service))
      .get('/v1/content/drafts/draft-001')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
  });

  it('passes draft id to getDraft', async () => {
    await request(buildApp(authService, contentService))
      .get('/v1/content/drafts/draft-xyz')
      .set('Authorization', 'Bearer token');
    expect(contentService.getDraft).toHaveBeenCalledWith('ws-001', 'user-001', 'draft-xyz');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/content/generate
// ---------------------------------------------------------------------------

describe('POST /v1/content/generate', () => {
  let contentService: MockContentService;

  beforeEach(() => {
    vi.clearAllMocks();
    contentService = makeContentService();
  });

  it('returns 201 with generated draft for member role', async () => {
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, contentService))
      .post('/v1/content/generate')
      .set('Authorization', 'Bearer token')
      .send(VALID_GENERATE_BODY);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('generated_text');
    expect(res.body).toHaveProperty('brand_voice_score');
    expect(res.body).toHaveProperty('persona_fit_score');
    expect(res.body).toHaveProperty('word_count');
  });

  it('returns 403 for viewer role', async () => {
    const auth = makeAuthService('viewer');
    const res = await request(buildApp(auth, contentService))
      .post('/v1/content/generate')
      .set('Authorization', 'Bearer token')
      .send(VALID_GENERATE_BODY);
    expect(res.status).toBe(403);
  });

  it('returns 401 without JWT', async () => {
    const auth = makeAuthService('member');
    auth.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(auth, contentService))
      .post('/v1/content/generate')
      .send(VALID_GENERATE_BODY);
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields missing', async () => {
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, contentService))
      .post('/v1/content/generate')
      .set('Authorization', 'Bearer token')
      .send({ topic: 'Missing other fields' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('passes workspace_id to generateContent', async () => {
    const auth = makeAuthService('member');
    auth.verifyJwt.mockResolvedValue({ user_id: 'u1', workspace_id: 'ws-gen', role: 'member' });
    await request(buildApp(auth, contentService))
      .post('/v1/content/generate')
      .set('Authorization', 'Bearer token')
      .send(VALID_GENERATE_BODY);
    expect(contentService.generateContent).toHaveBeenCalledWith(
      'ws-gen',
      'u1',
      expect.objectContaining({ type: 'blog_post', topic: 'AI in Sales Enablement' }),
    );
  });

  it('admin role can generate content', async () => {
    const auth = makeAuthService('admin');
    const res = await request(buildApp(auth, contentService))
      .post('/v1/content/generate')
      .set('Authorization', 'Bearer token')
      .send(VALID_GENERATE_BODY);
    expect(res.status).toBe(201);
  });

  it('returns 500 on service error', async () => {
    const service = makeContentService({ generateResult: new Error('LLM timeout') });
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, service))
      .post('/v1/content/generate')
      .set('Authorization', 'Bearer token')
      .send(VALID_GENERATE_BODY);
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('LLM timeout');
  });
});

// ---------------------------------------------------------------------------
// PUT /v1/content/drafts/:id
// ---------------------------------------------------------------------------

describe('PUT /v1/content/drafts/:id', () => {
  let contentService: MockContentService;

  beforeEach(() => {
    vi.clearAllMocks();
    contentService = makeContentService();
  });

  it('returns 200 with updated draft for member role', async () => {
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, contentService))
      .put('/v1/content/drafts/draft-001')
      .set('Authorization', 'Bearer token')
      .send({ mode: 'regenerate' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('generated_text');
  });

  it('returns 200 for refine mode with instructions', async () => {
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, contentService))
      .put('/v1/content/drafts/draft-001')
      .set('Authorization', 'Bearer token')
      .send({ mode: 'refine', instructions: 'Make it shorter' });

    expect(res.status).toBe(200);
    expect(contentService.refineDraft).toHaveBeenCalledWith(
      'ws-001',
      'user-001',
      'draft-001',
      { mode: 'refine', instructions: 'Make it shorter' },
    );
  });

  it('returns 400 for invalid mode', async () => {
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, contentService))
      .put('/v1/content/drafts/draft-001')
      .set('Authorization', 'Bearer token')
      .send({ mode: 'invalid-mode' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when mode is missing', async () => {
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, contentService))
      .put('/v1/content/drafts/draft-001')
      .set('Authorization', 'Bearer token')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when draft not found', async () => {
    const service = makeContentService({ refineResult: null });
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, service))
      .put('/v1/content/drafts/nonexistent')
      .set('Authorization', 'Bearer token')
      .send({ mode: 'regenerate' });
    expect(res.status).toBe(404);
  });

  it('returns 403 for viewer role', async () => {
    const auth = makeAuthService('viewer');
    const res = await request(buildApp(auth, contentService))
      .put('/v1/content/drafts/draft-001')
      .set('Authorization', 'Bearer token')
      .send({ mode: 'regenerate' });
    expect(res.status).toBe(403);
  });

  it('returns 401 without JWT', async () => {
    const auth = makeAuthService('member');
    auth.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(auth, contentService))
      .put('/v1/content/drafts/draft-001')
      .send({ mode: 'regenerate' });
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeContentService({ refineResult: new Error('LLM timeout') });
    const auth = makeAuthService('member');
    const res = await request(buildApp(auth, service))
      .put('/v1/content/drafts/draft-001')
      .set('Authorization', 'Bearer token')
      .send({ mode: 'regenerate' });
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('LLM timeout');
  });
});
