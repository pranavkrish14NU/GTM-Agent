/**
 * Route tests for /v1/documents.
 *
 * Uses supertest to send real HTTP requests against the Express app.
 * DocumentService and AuthService are fully mocked — no database calls.
 *
 * Coverage:
 *   GET /v1/documents
 *   ✓ returns 200 with paginated list
 *   ✓ passes page and pageSize query params to service
 *   ✓ returns 401 when no JWT present
 *   ✓ is accessible to viewer role
 *   ✓ returns 500 when service throws
 *
 *   GET /v1/documents/duplicates
 *   ✓ returns 200 with duplicate groups
 *   ✓ returns 401 when no JWT present
 *
 *   GET /v1/documents/outdated
 *   ✓ returns 200 with outdated docs using default threshold
 *   ✓ passes threshold query param to service
 *   ✓ returns 400 for non-numeric threshold
 *   ✓ returns 400 for out-of-range threshold
 *   ✓ returns 401 when no JWT present
 *
 *   GET /v1/documents/search
 *   ✓ returns 200 with search results
 *   ✓ returns 400 when q is missing
 *   ✓ returns 400 when q is blank
 *   ✓ returns 401 when no JWT present
 *
 *   GET /v1/documents/health
 *   ✓ returns 200 with health metrics
 *   ✓ returns 401 when no JWT present
 */

import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { createDocumentsRouter } from '../src/routes/documents.js';
import type { DocumentService } from '../src/services/document.service.js';
import type { AuthService } from '../src/services/auth.service.js';
import type { BobaClaims } from '../src/services/auth.service.js';
import {
  FIXTURE_DOC_WITH_FRESHNESS,
  FIXTURE_HEALTH_METRICS,
} from './fixtures/documents.js';

// ---------------------------------------------------------------------------
// JWT claim fixtures
// ---------------------------------------------------------------------------

const VIEWER_CLAIMS: BobaClaims = {
  user_id: 'user-viewer',
  workspace_id: 'ws-001',
  email: 'viewer@example.com',
  role: 'viewer',
  iss: 'https://api.boba.app',
  aud: 'boba-api',
};

// ---------------------------------------------------------------------------
// App factory with injected mocks
// ---------------------------------------------------------------------------

function makeApp(
  callerClaims: BobaClaims | null,
  serviceOverrides: Partial<DocumentService>,
) {
  const mockAuthService = {
    verifyJwt: vi.fn(async () => {
      if (!callerClaims) throw new Error('Unauthorized');
      return callerClaims;
    }),
  } as unknown as AuthService;

  const mockService: DocumentService = {
    listDocuments: vi.fn(async () => ({
      data: [FIXTURE_DOC_WITH_FRESHNESS],
      total: 1,
      page: 1,
      pageSize: 20,
    })),
    getDuplicates: vi.fn(async () => [
      { content_hash: 'hash-abc123', documents: [FIXTURE_DOC_WITH_FRESHNESS] },
    ]),
    getOutdated: vi.fn(async () => [FIXTURE_DOC_WITH_FRESHNESS]),
    search: vi.fn(async () => [FIXTURE_DOC_WITH_FRESHNESS]),
    getHealth: vi.fn(async () => FIXTURE_HEALTH_METRICS),
    ...serviceOverrides,
  } as unknown as DocumentService;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/v1/documents', createDocumentsRouter(mockAuthService, mockService));

  return { app, mockService };
}

// ---------------------------------------------------------------------------
// GET /v1/documents
// ---------------------------------------------------------------------------

describe('GET /v1/documents', () => {
  it('returns 200 with a paginated document list', async () => {
    const { app } = makeApp(VIEWER_CLAIMS, {});
    const res = await request(app)
      .get('/v1/documents')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
  });

  it('passes page and pageSize query params to the service', async () => {
    const { app, mockService } = makeApp(VIEWER_CLAIMS, {});
    await request(app)
      .get('/v1/documents?page=2&pageSize=10')
      .set('Authorization', 'Bearer valid-token');
    expect(mockService.listDocuments).toHaveBeenCalledWith('ws-001', {
      page: 2,
      pageSize: 10,
    });
  });

  it('returns 401 when no JWT is present', async () => {
    const { app } = makeApp(null, {});
    const res = await request(app).get('/v1/documents');
    expect(res.status).toBe(401);
  });

  it('is accessible to the viewer role', async () => {
    const { app } = makeApp(VIEWER_CLAIMS, {});
    const res = await request(app)
      .get('/v1/documents')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
  });

  it('returns 500 when the service throws', async () => {
    const { app } = makeApp(VIEWER_CLAIMS, {
      listDocuments: vi.fn(async () => { throw new Error('DB error'); }),
    });
    const res = await request(app)
      .get('/v1/documents')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/DB error/);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/documents/duplicates
// ---------------------------------------------------------------------------

describe('GET /v1/documents/duplicates', () => {
  it('returns 200 with duplicate groups', async () => {
    const { app } = makeApp(VIEWER_CLAIMS, {});
    const res = await request(app)
      .get('/v1/documents/duplicates')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].content_hash).toBe('hash-abc123');
  });

  it('returns 401 when no JWT is present', async () => {
    const { app } = makeApp(null, {});
    const res = await request(app).get('/v1/documents/duplicates');
    expect(res.status).toBe(401);
  });

  it('returns 500 when the service throws', async () => {
    const { app } = makeApp(VIEWER_CLAIMS, {
      getDuplicates: vi.fn(async () => { throw new Error('Query failed'); }),
    });
    const res = await request(app)
      .get('/v1/documents/duplicates')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/documents/outdated
// ---------------------------------------------------------------------------

describe('GET /v1/documents/outdated', () => {
  it('returns 200 with outdated docs using default threshold', async () => {
    const { app } = makeApp(VIEWER_CLAIMS, {});
    const res = await request(app)
      .get('/v1/documents/outdated')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('passes the threshold query param to the service', async () => {
    const { app, mockService } = makeApp(VIEWER_CLAIMS, {});
    await request(app)
      .get('/v1/documents/outdated?threshold=50')
      .set('Authorization', 'Bearer valid-token');
    expect(mockService.getOutdated).toHaveBeenCalledWith('ws-001', 50);
  });

  it('returns 400 for a non-numeric threshold', async () => {
    const { app } = makeApp(VIEWER_CLAIMS, {});
    const res = await request(app)
      .get('/v1/documents/outdated?threshold=abc')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/threshold/);
  });

  it('returns 400 when threshold is out of range', async () => {
    const { app } = makeApp(VIEWER_CLAIMS, {});
    const res = await request(app)
      .get('/v1/documents/outdated?threshold=200')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(400);
  });

  it('returns 401 when no JWT is present', async () => {
    const { app } = makeApp(null, {});
    const res = await request(app).get('/v1/documents/outdated');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/documents/search
// ---------------------------------------------------------------------------

describe('GET /v1/documents/search', () => {
  it('returns 200 with search results', async () => {
    const { app } = makeApp(VIEWER_CLAIMS, {});
    const res = await request(app)
      .get('/v1/documents/search?q=brand')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe('doc-001');
  });

  it('passes the q param to the service', async () => {
    const { app, mockService } = makeApp(VIEWER_CLAIMS, {});
    await request(app)
      .get('/v1/documents/search?q=messaging')
      .set('Authorization', 'Bearer valid-token');
    expect(mockService.search).toHaveBeenCalledWith('ws-001', 'messaging');
  });

  it('returns 400 when q is missing', async () => {
    const { app } = makeApp(VIEWER_CLAIMS, {});
    const res = await request(app)
      .get('/v1/documents/search')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/q/);
  });

  it('returns 400 when q is blank whitespace', async () => {
    const { app } = makeApp(VIEWER_CLAIMS, {});
    const res = await request(app)
      .get('/v1/documents/search?q=   ')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(400);
  });

  it('returns 401 when no JWT is present', async () => {
    const { app } = makeApp(null, {});
    const res = await request(app).get('/v1/documents/search?q=test');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/documents/health
// ---------------------------------------------------------------------------

describe('GET /v1/documents/health', () => {
  it('returns 200 with health metrics', async () => {
    const { app } = makeApp(VIEWER_CLAIMS, {});
    const res = await request(app)
      .get('/v1/documents/health')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.total_files).toBe(4);
    expect(res.body.synced_files).toBe(3);
    expect(res.body.average_freshness).toBe(72);
    expect(res.body.error_count).toBe(1);
  });

  it('returns 401 when no JWT is present', async () => {
    const { app } = makeApp(null, {});
    const res = await request(app).get('/v1/documents/health');
    expect(res.status).toBe(401);
  });

  it('returns 500 when the service throws', async () => {
    const { app } = makeApp(VIEWER_CLAIMS, {
      getHealth: vi.fn(async () => { throw new Error('Health check failed'); }),
    });
    const res = await request(app)
      .get('/v1/documents/health')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(500);
  });
});
