/**
 * Integration tests for Persona Intelligence routes.
 *
 * GET /v1/personas
 *   - 200 with PersonaInsightResult array
 *   - 200 with empty array when no personas exist
 *   - 401 without JWT
 *   - 500 on service error
 *
 * GET /v1/personas/:id
 *   - 200 with single PersonaInsightResult
 *   - 404 when persona not found
 *   - 401 without JWT
 *   - 500 on service error
 *
 * POST /v1/personas/generate
 *   - 200 with success message for member role
 *   - 403 for viewer role
 *   - 401 without JWT
 *   - 500 on service error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { PersonaInsightResult } from '../src/services/persona.service.js';
import { createPersonaRouter } from '../src/routes/personas.js';
import {
  FIXTURE_ALL_PERSONAS,
  FIXTURE_PERSONA_VP_MARKETING,
} from './fixtures/persona.js';

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

type MockPersonaService = {
  getPersonas: ReturnType<typeof vi.fn>;
  getPersona: ReturnType<typeof vi.fn>;
  generatePersonas: ReturnType<typeof vi.fn>;
};

function makePersonaService(opts?: {
  personasResult?: PersonaInsightResult[] | Error;
  personaResult?: PersonaInsightResult | null | Error;
  generateError?: Error;
}): MockPersonaService {
  return {
    getPersonas: vi.fn().mockImplementation(async () => {
      if (opts?.personasResult instanceof Error) throw opts.personasResult;
      return opts?.personasResult ?? FIXTURE_ALL_PERSONAS;
    }),
    getPersona: vi.fn().mockImplementation(async () => {
      if (opts && 'personaResult' in opts) {
        const result = opts.personaResult;
        if (result instanceof Error) throw result;
        return result;
      }
      return FIXTURE_PERSONA_VP_MARKETING;
    }),
    generatePersonas: vi.fn().mockImplementation(async () => {
      if (opts?.generateError) throw opts.generateError;
    }),
  };
}

function buildApp(
  authService: ReturnType<typeof makeAuthService>,
  personaService: MockPersonaService,
) {
  const app = express();
  app.use(express.json());
  app.use('/v1/personas', createPersonaRouter(authService as never, personaService as never));
  return app;
}

// ---------------------------------------------------------------------------
// GET /v1/personas
// ---------------------------------------------------------------------------

describe('GET /v1/personas', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let personaService: MockPersonaService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService();
    personaService = makePersonaService();
  });

  it('returns 200 with array of PersonaInsightResult', async () => {
    const app = buildApp(authService, personaService);
    const res = await request(app)
      .get('/v1/personas')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(5);
    expect(res.body[0]).toHaveProperty('role');
    expect(res.body[0]).toHaveProperty('goals');
    expect(res.body[0]).toHaveProperty('pain_points');
    expect(res.body[0]).toHaveProperty('recommended_content_gaps');
  });

  it('returns 200 with empty array when no personas exist', async () => {
    const service = makePersonaService({ personasResult: [] });
    const app = buildApp(authService, service);
    const res = await request(app)
      .get('/v1/personas')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const app = buildApp(authService, personaService);
    const res = await request(app).get('/v1/personas');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makePersonaService({ personasResult: new Error('DB failure') });
    const app = buildApp(authService, service);
    const res = await request(app)
      .get('/v1/personas')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('passes workspace_id from JWT to getPersonas', async () => {
    authService.verifyJwt.mockResolvedValue({ user_id: 'u1', workspace_id: 'ws-custom', role: 'viewer' });
    const app = buildApp(authService, personaService);
    await request(app)
      .get('/v1/personas')
      .set('Authorization', 'Bearer token');
    expect(personaService.getPersonas).toHaveBeenCalledWith('ws-custom');
  });

  it('viewer role can access personas', async () => {
    const app = buildApp(makeAuthService('viewer'), personaService);
    const res = await request(app)
      .get('/v1/personas')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/personas/:id
// ---------------------------------------------------------------------------

describe('GET /v1/personas/:id', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let personaService: MockPersonaService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService();
    personaService = makePersonaService();
  });

  it('returns 200 with PersonaInsightResult', async () => {
    const app = buildApp(authService, personaService);
    const res = await request(app)
      .get('/v1/personas/ins-persona-001')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('role', 'VP of Marketing');
    expect(res.body).toHaveProperty('goals');
    expect(res.body).toHaveProperty('sources');
    expect(res.body.confidence_level).toBe('high');
  });

  it('returns 404 when persona not found', async () => {
    const service = makePersonaService({ personaResult: null });
    const app = buildApp(authService, service);
    const res = await request(app)
      .get('/v1/personas/nonexistent')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const app = buildApp(authService, personaService);
    const res = await request(app).get('/v1/personas/ins-001');
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makePersonaService({ personaResult: new Error('DB failure') });
    const app = buildApp(authService, service);
    const res = await request(app)
      .get('/v1/personas/ins-001')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('passes workspace_id and id to getPersona', async () => {
    authService.verifyJwt.mockResolvedValue({ user_id: 'u1', workspace_id: 'ws-persona', role: 'viewer' });
    const app = buildApp(authService, personaService);
    await request(app)
      .get('/v1/personas/ins-persona-001')
      .set('Authorization', 'Bearer token');
    expect(personaService.getPersona).toHaveBeenCalledWith('ws-persona', 'ins-persona-001');
  });
});

// ---------------------------------------------------------------------------
// POST /v1/personas/generate
// ---------------------------------------------------------------------------

describe('POST /v1/personas/generate', () => {
  let personaService: MockPersonaService;

  beforeEach(() => {
    vi.clearAllMocks();
    personaService = makePersonaService();
  });

  it('returns 200 with success message for member role', async () => {
    const auth = makeAuthService('member');
    const app = buildApp(auth, personaService);
    const res = await request(app)
      .post('/v1/personas/generate')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body.message).toContain('complete');
  });

  it('returns 403 for viewer role', async () => {
    const auth = makeAuthService('viewer');
    const app = buildApp(auth, personaService);
    const res = await request(app)
      .post('/v1/personas/generate')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('returns 401 without JWT', async () => {
    const auth = makeAuthService('member');
    auth.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const app = buildApp(auth, personaService);
    const res = await request(app).post('/v1/personas/generate');
    expect(res.status).toBe(401);
  });

  it('calls generatePersonas with workspace_id from JWT', async () => {
    const auth = makeAuthService('member');
    auth.verifyJwt.mockResolvedValue({ user_id: 'u1', workspace_id: 'ws-generate', role: 'member' });
    const app = buildApp(auth, personaService);
    await request(app)
      .post('/v1/personas/generate')
      .set('Authorization', 'Bearer token');
    expect(personaService.generatePersonas).toHaveBeenCalledWith('ws-generate');
  });

  it('returns 500 on service error', async () => {
    const service = makePersonaService({ generateError: new Error('Generation failure') });
    const auth = makeAuthService('member');
    const app = buildApp(auth, service);
    const res = await request(app)
      .post('/v1/personas/generate')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Generation failure');
  });

  it('admin role can trigger persona generation', async () => {
    const auth = makeAuthService('admin');
    const app = buildApp(auth, personaService);
    const res = await request(app)
      .post('/v1/personas/generate')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });
});
