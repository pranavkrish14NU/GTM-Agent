/**
 * Route tests for /v1/connections/drive.
 *
 * Uses supertest to send real HTTP requests against the Express app.
 * The DriveConnectionService and AuthService are fully mocked — no database
 * or network calls.
 *
 * Coverage:
 *   POST /v1/connections/drive
 *   ✓ returns 201 with ConnectionStatus on success
 *   ✓ returns 400 when access_token is missing
 *   ✓ returns 400 when refresh_token is missing
 *   ✓ returns 400 when scopes is not an array
 *   ✓ returns 401 when no JWT is present
 *   ✓ returns 403 when caller has member role (requires admin)
 *
 *   GET /v1/connections/drive
 *   ✓ returns 200 with ConnectionStatus when connected
 *   ✓ returns 200 with { status: 'disconnected' } when not connected
 *   ✓ returns 401 when no JWT
 *
 *   PUT /v1/connections/drive/folders
 *   ✓ returns 200 with updated ConnectionStatus
 *   ✓ returns 400 when mappings is not an array
 *   ✓ returns 400 when a mapping is missing folder_id
 *   ✓ returns 404 when no connection exists
 *   ✓ returns 403 when caller has viewer role
 *
 *   POST /v1/connections/drive/sync
 *   ✓ returns 200 with sync queued message
 *   ✓ returns 404 when no connection exists
 *   ✓ returns 403 when caller has member role
 *
 *   DELETE /v1/connections/drive
 *   ✓ returns 204 on success
 *   ✓ returns 404 when no connection exists
 *   ✓ returns 403 when caller has member role
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { createDriveConnectionsRouter } from '../src/routes/drive-connections.js';
import type { DriveConnectionService } from '../src/services/drive-connection.service.js';
import type { AuthService } from '../src/services/auth.service.js';
import {
  FIXTURE_CONNECTION_STATUS,
  FIXTURE_FOLDER_MAPPINGS,
} from './fixtures/drive-connection.js';
import type { BobaClaims } from '../src/services/auth.service.js';

// ---------------------------------------------------------------------------
// JWT claim fixtures
// ---------------------------------------------------------------------------

const ADMIN_CLAIMS: BobaClaims = {
  user_id: 'user-admin',
  workspace_id: 'ws-001',
  email: 'admin@example.com',
  role: 'admin',
  iss: 'https://api.boba.app',
  aud: 'boba-api',
};

const MEMBER_CLAIMS: BobaClaims = {
  user_id: 'user-member',
  workspace_id: 'ws-001',
  email: 'member@example.com',
  role: 'member',
  iss: 'https://api.boba.app',
  aud: 'boba-api',
};

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
  serviceOverrides: Partial<DriveConnectionService>,
) {
  // Mock AuthService — verifyJwt resolves to callerClaims (or rejects if null).
  const mockAuthService = {
    verifyJwt: vi.fn(async () => {
      if (!callerClaims) throw new Error('Unauthorized');
      return callerClaims;
    }),
  } as unknown as AuthService;

  // Mock DriveConnectionService with all methods as vi.fn().
  const mockService: DriveConnectionService = {
    createConnection: vi.fn(async () => FIXTURE_CONNECTION_STATUS),
    getConnection: vi.fn(async () => FIXTURE_CONNECTION_STATUS),
    updateFolderMappings: vi.fn(async () => FIXTURE_CONNECTION_STATUS),
    triggerSync: vi.fn(async () => undefined),
    deleteConnection: vi.fn(async () => true),
    getDecryptedAccessToken: vi.fn(async () => 'tok'),
    ...serviceOverrides,
  } as unknown as DriveConnectionService;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/v1/connections/drive', createDriveConnectionsRouter(mockAuthService, mockService));

  return { app, mockService };
}

// ---------------------------------------------------------------------------
// POST /v1/connections/drive
// ---------------------------------------------------------------------------

describe('POST /v1/connections/drive', () => {
  it('returns 201 with ConnectionStatus on success', async () => {
    const { app } = makeApp(ADMIN_CLAIMS, {});
    const res = await request(app)
      .post('/v1/connections/drive')
      .set('Authorization', 'Bearer valid-token')
      .send({
        access_token: 'ya29.access',
        refresh_token: '1//refresh',
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('conn-001');
    expect(res.body.status).toBe('connected');
  });

  it('returns 400 when access_token is missing', async () => {
    const { app } = makeApp(ADMIN_CLAIMS, {});
    const res = await request(app)
      .post('/v1/connections/drive')
      .set('Authorization', 'Bearer valid-token')
      .send({ refresh_token: '1//refresh', scopes: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/access_token/);
  });

  it('returns 400 when refresh_token is missing', async () => {
    const { app } = makeApp(ADMIN_CLAIMS, {});
    const res = await request(app)
      .post('/v1/connections/drive')
      .set('Authorization', 'Bearer valid-token')
      .send({ access_token: 'ya29', scopes: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/refresh_token/);
  });

  it('returns 400 when scopes is not an array', async () => {
    const { app } = makeApp(ADMIN_CLAIMS, {});
    const res = await request(app)
      .post('/v1/connections/drive')
      .set('Authorization', 'Bearer valid-token')
      .send({ access_token: 'ya29', refresh_token: '1//', scopes: 'not-an-array' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scopes/);
  });

  it('returns 401 when no JWT is present', async () => {
    const { app } = makeApp(null, {});
    const res = await request(app)
      .post('/v1/connections/drive')
      .send({ access_token: 'ya29', refresh_token: '1//', scopes: [] });
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller has member role (requires admin)', async () => {
    const { app } = makeApp(MEMBER_CLAIMS, {});
    const res = await request(app)
      .post('/v1/connections/drive')
      .set('Authorization', 'Bearer valid-token')
      .send({ access_token: 'ya29', refresh_token: '1//', scopes: [] });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/connections/drive
// ---------------------------------------------------------------------------

describe('GET /v1/connections/drive', () => {
  it('returns 200 with ConnectionStatus when connected', async () => {
    const { app } = makeApp(ADMIN_CLAIMS, {});
    const res = await request(app)
      .get('/v1/connections/drive')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('conn-001');
    expect(res.body.sync_status).toBe('idle');
  });

  it('returns { status: disconnected } when no connection exists', async () => {
    const { app } = makeApp(ADMIN_CLAIMS, {
      getConnection: vi.fn(async () => null),
    });
    const res = await request(app)
      .get('/v1/connections/drive')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('disconnected');
  });

  it('returns 401 when no JWT present', async () => {
    const { app } = makeApp(null, {});
    const res = await request(app).get('/v1/connections/drive');
    expect(res.status).toBe(401);
  });

  it('is accessible to viewer role (read-only)', async () => {
    const { app } = makeApp(VIEWER_CLAIMS, {});
    const res = await request(app)
      .get('/v1/connections/drive')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// PUT /v1/connections/drive/folders
// ---------------------------------------------------------------------------

describe('PUT /v1/connections/drive/folders', () => {
  it('returns 200 with updated ConnectionStatus', async () => {
    const { app } = makeApp(ADMIN_CLAIMS, {});
    const res = await request(app)
      .put('/v1/connections/drive/folders')
      .set('Authorization', 'Bearer valid-token')
      .send({ mappings: FIXTURE_FOLDER_MAPPINGS });
    expect(res.status).toBe(200);
    expect(res.body.folder_mappings).toHaveLength(3);
  });

  it('returns 400 when mappings is not an array', async () => {
    const { app } = makeApp(ADMIN_CLAIMS, {});
    const res = await request(app)
      .put('/v1/connections/drive/folders')
      .set('Authorization', 'Bearer valid-token')
      .send({ mappings: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when a mapping entry is missing folder_id', async () => {
    const { app } = makeApp(ADMIN_CLAIMS, {});
    const res = await request(app)
      .put('/v1/connections/drive/folders')
      .set('Authorization', 'Bearer valid-token')
      .send({ mappings: [{ folder_name: 'No ID', module: 'brand' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/folder_id/);
  });

  it('returns 400 when a mapping entry is missing module', async () => {
    const { app } = makeApp(ADMIN_CLAIMS, {});
    const res = await request(app)
      .put('/v1/connections/drive/folders')
      .set('Authorization', 'Bearer valid-token')
      .send({ mappings: [{ folder_id: 'f1', folder_name: 'Test' }] });
    expect(res.status).toBe(400);
  });

  it('returns 404 when no connection exists', async () => {
    const { app } = makeApp(ADMIN_CLAIMS, {
      updateFolderMappings: vi.fn(async () => null),
    });
    const res = await request(app)
      .put('/v1/connections/drive/folders')
      .set('Authorization', 'Bearer valid-token')
      .send({ mappings: [] });
    expect(res.status).toBe(404);
  });

  it('returns 403 when caller has viewer role', async () => {
    const { app } = makeApp(VIEWER_CLAIMS, {});
    const res = await request(app)
      .put('/v1/connections/drive/folders')
      .set('Authorization', 'Bearer valid-token')
      .send({ mappings: [] });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/connections/drive/sync
// ---------------------------------------------------------------------------

describe('POST /v1/connections/drive/sync', () => {
  it('returns 200 with a sync queued message', async () => {
    const { app } = makeApp(ADMIN_CLAIMS, {});
    const res = await request(app)
      .post('/v1/connections/drive/sync')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/enqueued/i);
  });

  it('returns 404 when no connection exists', async () => {
    const { app } = makeApp(ADMIN_CLAIMS, {
      triggerSync: vi.fn(async () => {
        throw new Error('No Drive connection found for this workspace');
      }),
    });
    const res = await request(app)
      .post('/v1/connections/drive/sync')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(404);
  });

  it('returns 403 when caller has member role', async () => {
    const { app } = makeApp(MEMBER_CLAIMS, {});
    const res = await request(app)
      .post('/v1/connections/drive/sync')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/connections/drive
// ---------------------------------------------------------------------------

describe('DELETE /v1/connections/drive', () => {
  it('returns 204 on successful deletion', async () => {
    const { app } = makeApp(ADMIN_CLAIMS, {});
    const res = await request(app)
      .delete('/v1/connections/drive')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(204);
  });

  it('returns 404 when no connection exists', async () => {
    const { app } = makeApp(ADMIN_CLAIMS, {
      deleteConnection: vi.fn(async () => false),
    });
    const res = await request(app)
      .delete('/v1/connections/drive')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(404);
  });

  it('returns 403 when caller has member role', async () => {
    const { app } = makeApp(MEMBER_CLAIMS, {});
    const res = await request(app)
      .delete('/v1/connections/drive')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(403);
  });

  it('calls deleteConnection with the workspace_id from JWT', async () => {
    const { app, mockService } = makeApp(ADMIN_CLAIMS, {});
    await request(app)
      .delete('/v1/connections/drive')
      .set('Authorization', 'Bearer valid-token');
    expect(mockService.deleteConnection).toHaveBeenCalledWith('ws-001');
  });
});
