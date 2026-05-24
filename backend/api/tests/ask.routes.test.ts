/**
 * Integration tests for Ask BOBA routes.
 *
 * POST /v1/ask
 *   - 200 with structured AskResponse
 *   - 400 when query is missing or blank
 *   - 401 without JWT
 *   - 403 insufficient role
 *   - 500 on service error
 *
 * GET /v1/ask/history
 *   - 200 with paginated history
 *   - 401 without JWT
 *   - 500 on service error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { AskResponse, QueryHistoryResult } from '../src/services/ask.service.js';
import { createAskRouter } from '../src/routes/ask.js';
import { FIXTURE_ASK_RESPONSE, FIXTURE_HISTORY_RESULT } from './fixtures/ask.js';

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

function makeAskService(
  askResult: AskResponse | Error = FIXTURE_ASK_RESPONSE,
  historyResult: QueryHistoryResult | Error = FIXTURE_HISTORY_RESULT,
) {
  return {
    ask: vi.fn().mockImplementation(async () => {
      if (askResult instanceof Error) throw askResult;
      return askResult;
    }),
    getHistory: vi.fn().mockImplementation(async () => {
      if (historyResult instanceof Error) throw historyResult;
      return historyResult;
    }),
  };
}

function buildApp(
  authService: ReturnType<typeof makeAuthService>,
  askService: ReturnType<typeof makeAskService>,
) {
  const app = express();
  app.use(express.json());
  app.use('/v1/ask', createAskRouter(authService as never, askService as never));
  return app;
}

// ---------------------------------------------------------------------------
// POST /v1/ask
// ---------------------------------------------------------------------------

describe('POST /v1/ask', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let askService: ReturnType<typeof makeAskService>;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService();
    askService = makeAskService();
  });

  it('returns 200 with structured AskResponse', async () => {
    const app = buildApp(authService, askService);
    const res = await request(app)
      .post('/v1/ask')
      .set('Authorization', 'Bearer valid-token')
      .send({ query: 'What is our brand voice?' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      query_id: 'query-001',
      conversation_id: 'conv-001',
      answer: 'The brand voice is professional and customer-focused.',
      confidence_level: 'high',
    });
    expect(Array.isArray(res.body.sources)).toBe(true);
    expect(Array.isArray(res.body.suggested_next_actions)).toBe(true);
  });

  it('passes query and conversation_id to askService.ask', async () => {
    const app = buildApp(authService, askService);
    await request(app)
      .post('/v1/ask')
      .set('Authorization', 'Bearer valid-token')
      .send({ query: 'Brand voice?', conversation_id: 'conv-existing' });

    expect(askService.ask).toHaveBeenCalledWith('ws-001', 'user-001', 'Brand voice?', 'conv-existing');

  });

  it('returns 400 when query is missing', async () => {
    const app = buildApp(authService, askService);
    const res = await request(app)
      .post('/v1/ask')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.stringContaining('query') });
  });

  it('returns 400 when query is blank whitespace', async () => {
    const app = buildApp(authService, askService);
    const res = await request(app)
      .post('/v1/ask')
      .set('Authorization', 'Bearer valid-token')
      .send({ query: '   ' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without Authorization header', async () => {
    authService = makeAuthService();
    (authService.verifyJwt as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const app = buildApp(authService, askService);
    const res = await request(app)
      .post('/v1/ask')
      .send({ query: 'Query?' });

    expect(res.status).toBe(401);
  });

  it('returns 403 when role is insufficient', async () => {
    authService = makeAuthService('none');
    const app = buildApp(authService, askService);
    const res = await request(app)
      .post('/v1/ask')
      .set('Authorization', 'Bearer valid-token')
      .send({ query: 'Query?' });

    expect(res.status).toBe(403);
  });

  it('returns 500 when askService throws', async () => {
    askService = makeAskService(new Error('LLM gateway unavailable'));
    const app = buildApp(authService, askService);
    const res = await request(app)
      .post('/v1/ask')
      .set('Authorization', 'Bearer valid-token')
      .send({ query: 'Query?' });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'LLM gateway unavailable' });
  });

  it('returns 500 with generic message for non-Error throws', async () => {
    askService = {
      ask: vi.fn().mockRejectedValue('string error'),
      getHistory: vi.fn(),
    };
    const app = buildApp(authService, askService as never);
    const res = await request(app)
      .post('/v1/ask')
      .set('Authorization', 'Bearer valid-token')
      .send({ query: 'Query?' });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'Failed to process query' });
  });
});

// ---------------------------------------------------------------------------
// GET /v1/ask/history
// ---------------------------------------------------------------------------

describe('GET /v1/ask/history', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let askService: ReturnType<typeof makeAskService>;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService();
    askService = makeAskService();
  });

  it('returns 200 with paginated history', async () => {
    const app = buildApp(authService, askService);
    const res = await request(app)
      .get('/v1/ask/history')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: expect.any(Array),
      total: 2,
      page: 1,
      pageSize: 20,
    });
    expect(res.body.data).toHaveLength(2);
  });

  it('passes page and pageSize to getHistory', async () => {
    const app = buildApp(authService, askService);
    await request(app)
      .get('/v1/ask/history?page=2&pageSize=10')
      .set('Authorization', 'Bearer valid-token');

    expect(askService.getHistory).toHaveBeenCalledWith('ws-001', 'user-001', 2, 10);

  });

  it('caps pageSize at 100', async () => {
    const app = buildApp(authService, askService);
    await request(app)
      .get('/v1/ask/history?pageSize=500')
      .set('Authorization', 'Bearer valid-token');

    const call = (askService.getHistory as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call![3]).toBe(100);
  });

  it('returns 401 without Authorization header', async () => {
    (authService.verifyJwt as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const app = buildApp(authService, askService);
    const res = await request(app).get('/v1/ask/history');

    expect(res.status).toBe(401);
  });

  it('returns 500 when getHistory throws', async () => {
    askService = makeAskService(FIXTURE_ASK_RESPONSE, new Error('DB connection failed'));
    const app = buildApp(authService, askService);
    const res = await request(app)
      .get('/v1/ask/history')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'DB connection failed' });
  });
});
