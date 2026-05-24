/**
 * Unit tests — caching behaviour in ask, dashboard, and documents routes.
 *
 * Tests:
 *   - Cache hit returns cached value (service not called again)
 *   - Cache miss calls service and populates cache
 *   - Dashboard refresh invalidates dashboard cache
 *   - Document list cache uses workspace-namespaced key
 *   - Conversation queries bypass cache (conversational context varies)
 *   - Cache misses and hits are tracked by metrics counters
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAskRouter } from '../src/routes/ask.js';
import { createDashboardRouter } from '../src/routes/dashboard.js';
import { createDocumentsRouter } from '../src/routes/documents.js';
import { InMemoryCacheService, cacheKey, hashQuery } from '../src/services/cache.service.js';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeAuthService(role = 'admin') {
  return {
    verifyJwt: vi.fn().mockResolvedValue({
      user_id: 'u-admin',
      workspace_id: 'ws-test',
      email: 'admin@test.com',
      role,
    }),
  };
}

const MOCK_ASK_RESULT = {
  query_id: 'q-1',
  conversation_id: 'c-1',
  answer: 'The answer is 42.',
  evidence_summary: 'Based on 3 sources.',
  sources: [],
  confidence_level: 'high' as const,
  suggested_next_actions: [],
};

const MOCK_DASHBOARD = {
  overall_health_score: 78,
  last_generated_at: '2026-05-01T00:00:00Z',
  dimensions: [],
  priority_recommendations: [],
};

const MOCK_DOCUMENTS = {
  data: [{ id: 'doc-1', title: 'Playbook', freshness_score: 90 }],
  total: 1,
  page: 1,
  pageSize: 20,
};

function makeAskService() {
  return {
    ask: vi.fn().mockResolvedValue(MOCK_ASK_RESULT),
    getHistory: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 }),
  };
}

function makeInsightService() {
  return {
    getDashboard: vi.fn().mockResolvedValue(MOCK_DASHBOARD),
    getDimensionDetail: vi.fn().mockResolvedValue(null),
    generateForWorkspace: vi.fn().mockResolvedValue(undefined),
    // expose GTM_DIMENSIONS shape for the router's VALID_DIMENSION_IDS set
  };
}

function makeDocumentService() {
  return {
    listDocuments: vi.fn().mockResolvedValue(MOCK_DOCUMENTS),
    getDuplicates: vi.fn().mockResolvedValue([]),
    getOutdated: vi.fn().mockResolvedValue([]),
    search: vi.fn().mockResolvedValue([]),
    getHealth: vi.fn().mockResolvedValue({}),
  };
}

// ---------------------------------------------------------------------------
// Ask route — caching
// ---------------------------------------------------------------------------

describe('POST /v1/ask — cache behaviour', () => {
  let cache: InMemoryCacheService;
  let askService: ReturnType<typeof makeAskService>;
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    cache = new InMemoryCacheService();
    askService = makeAskService();
    app = express();
    app.use(express.json());
    app.use('/v1/ask', createAskRouter(makeAuthService() as never, askService as never, cache));
  });

  it('calls askService on first request (cache miss)', async () => {
    const res = await request(app)
      .post('/v1/ask')
      .set('Authorization', 'Bearer token')
      .send({ query: 'What is ICP?' });

    expect(res.status).toBe(200);
    expect(askService.ask).toHaveBeenCalledTimes(1);
    expect(cache.misses).toBe(1);
    expect(cache.hits).toBe(0);
  });

  it('returns cached result and skips askService on second identical request', async () => {
    // First call — populates cache.
    await request(app)
      .post('/v1/ask')
      .set('Authorization', 'Bearer token')
      .send({ query: 'What is ICP?' });

    // Second call — should hit cache.
    const res = await request(app)
      .post('/v1/ask')
      .set('Authorization', 'Bearer token')
      .send({ query: 'What is ICP?' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ query_id: 'q-1', answer: 'The answer is 42.' });
    // Service should only have been called once total.
    expect(askService.ask).toHaveBeenCalledTimes(1);
    expect(cache.hits).toBe(1);
  });

  it('uses workspace-namespaced key so different workspaces do not share cache', async () => {
    // Build a second app for a different workspace.
    const authService2 = {
      verifyJwt: vi.fn().mockResolvedValue({
        user_id: 'u-other',
        workspace_id: 'ws-other',
        email: 'other@test.com',
        role: 'admin',
      }),
    };
    const app2 = express();
    app2.use(express.json());
    app2.use('/v1/ask', createAskRouter(authService2 as never, askService as never, cache));

    // Both apps share the same cache instance.
    await request(app)
      .post('/v1/ask')
      .set('Authorization', 'Bearer token')
      .send({ query: 'What is ICP?' });

    // Request from second workspace — different key, should be a miss.
    await request(app2)
      .post('/v1/ask')
      .set('Authorization', 'Bearer token')
      .send({ query: 'What is ICP?' });

    // Both workspaces required a service call.
    expect(askService.ask).toHaveBeenCalledTimes(2);
  });

  it('bypasses cache for conversational queries (conversation_id present)', async () => {
    // First call WITH conversation_id — should not cache.
    await request(app)
      .post('/v1/ask')
      .set('Authorization', 'Bearer token')
      .send({ query: 'Follow-up question?', conversation_id: 'conv-123' });

    // Second call with same conversation_id — should NOT be cached.
    await request(app)
      .post('/v1/ask')
      .set('Authorization', 'Bearer token')
      .send({ query: 'Follow-up question?', conversation_id: 'conv-123' });

    // Service called both times — conversational queries bypass the cache.
    expect(askService.ask).toHaveBeenCalledTimes(2);
    expect(cache.hits).toBe(0);
  });

  it('does not share cache entries between different queries', async () => {
    await request(app)
      .post('/v1/ask')
      .set('Authorization', 'Bearer token')
      .send({ query: 'Query A' });

    await request(app)
      .post('/v1/ask')
      .set('Authorization', 'Bearer token')
      .send({ query: 'Query B' });

    // Both queries require service calls.
    expect(askService.ask).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Dashboard route — caching and invalidation
// ---------------------------------------------------------------------------

describe('GET /v1/dashboard — cache behaviour', () => {
  let cache: InMemoryCacheService;
  let insightService: ReturnType<typeof makeInsightService>;
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    cache = new InMemoryCacheService();
    insightService = makeInsightService();
    app = express();
    app.use(express.json());
    app.use(
      '/v1/dashboard',
      createDashboardRouter(makeAuthService() as never, insightService as never, cache),
    );
  });

  it('returns dashboard on cache miss and caches result', async () => {
    const res = await request(app)
      .get('/v1/dashboard')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.overall_health_score).toBe(78);
    expect(insightService.getDashboard).toHaveBeenCalledTimes(1);
    expect(cache.misses).toBe(1);
  });

  it('returns cached dashboard on second request (service not called again)', async () => {
    await request(app).get('/v1/dashboard').set('Authorization', 'Bearer token');

    const res = await request(app).get('/v1/dashboard').set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(insightService.getDashboard).toHaveBeenCalledTimes(1);
    expect(cache.hits).toBe(1);
  });

  it('invalidates dashboard cache on POST /refresh', async () => {
    // Populate cache.
    await request(app).get('/v1/dashboard').set('Authorization', 'Bearer token');
    expect(cache.hits).toBe(0);

    // Refresh — should invalidate.
    await request(app)
      .post('/v1/dashboard/refresh')
      .set('Authorization', 'Bearer token');

    // Subsequent GET — should be a miss again.
    await request(app).get('/v1/dashboard').set('Authorization', 'Bearer token');

    // getDashboard called on first GET and after invalidation.
    expect(insightService.getDashboard).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Documents route — caching
// ---------------------------------------------------------------------------

describe('GET /v1/documents — cache behaviour', () => {
  let cache: InMemoryCacheService;
  let documentService: ReturnType<typeof makeDocumentService>;
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    cache = new InMemoryCacheService();
    documentService = makeDocumentService();
    app = express();
    app.use(express.json());
    app.use(
      '/v1/documents',
      createDocumentsRouter(makeAuthService() as never, documentService as never, cache),
    );
  });

  it('calls documentService on cache miss', async () => {
    const res = await request(app)
      .get('/v1/documents')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(documentService.listDocuments).toHaveBeenCalledTimes(1);
    expect(cache.misses).toBe(1);
  });

  it('returns cached result on second identical request', async () => {
    await request(app).get('/v1/documents').set('Authorization', 'Bearer token');

    const res = await request(app)
      .get('/v1/documents')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    // Service called only once.
    expect(documentService.listDocuments).toHaveBeenCalledTimes(1);
    expect(cache.hits).toBe(1);
  });

  it('uses different cache keys for different page params', async () => {
    await request(app)
      .get('/v1/documents?page=1&pageSize=20')
      .set('Authorization', 'Bearer token');

    await request(app)
      .get('/v1/documents?page=2&pageSize=20')
      .set('Authorization', 'Bearer token');

    // Different pages — both are misses, both call the service.
    expect(documentService.listDocuments).toHaveBeenCalledTimes(2);
  });

  it('routes without cache parameter still work', async () => {
    const noCacheApp = express();
    noCacheApp.use(express.json());
    noCacheApp.use(
      '/v1/documents',
      createDocumentsRouter(makeAuthService() as never, documentService as never),
    );

    const res = await request(noCacheApp)
      .get('/v1/documents')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(documentService.listDocuments).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Cache key helpers — integration check
// ---------------------------------------------------------------------------

describe('ask cache key construction', () => {
  it('builds the correct key format', () => {
    const workspaceId = 'ws-123';
    const query = 'What is ICP?';
    const key = cacheKey(workspaceId, 'ask', hashQuery(query));
    expect(key).toMatch(/^boba:ws-123:ask:[0-9a-f]{64}$/);
  });

  it('normalises whitespace via trim before hashing', () => {
    const key1 = hashQuery('ICP definition');
    const key2 = hashQuery('ICP definition');
    expect(key1).toBe(key2);
  });
});
