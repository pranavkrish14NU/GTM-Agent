/**
 * Unit tests — Admin GDPR routes.
 *
 * Tests:
 *   POST /v1/admin/data-export        — export user data
 *   DELETE /v1/admin/users/:id/data   — delete user data
 *   DELETE /v1/admin/workspace        — delete entire workspace (owner only)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAdminRouter } from '../src/routes/admin.js';
import { GDPR_CONFIRM_USER_DELETE, GDPR_CONFIRM_WORKSPACE_DELETE } from '../src/services/admin.service.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function makeAuthService(role = 'admin') {
  return {
    verifyJwt: vi.fn().mockResolvedValue({
      user_id: 'u-admin',
      workspace_id: 'ws-001',
      email: 'admin@test.com',
      role,
    }),
  };
}

const EXPORT_DATA = {
  user_id: 'u-admin',
  email: 'admin@test.com',
  name: 'Admin User',
  role: 'admin',
  exported_at: '2026-05-24T00:00:00Z',
  profile: { created_at: '2026-01-01T00:00:00Z', last_active_at: null },
  queries: [],
  drafts: [],
};

function makeAdminService(overrides: Record<string, unknown> = {}) {
  return {
    getConnections: vi.fn().mockResolvedValue([]),
    updateConnection: vi.fn(),
    getUsers: vi.fn().mockResolvedValue([]),
    updateUserRole: vi.fn(),
    scheduleSync: vi.fn(),
    getAuditLogs: vi.fn().mockResolvedValue({ entries: [], total: 0, page: 1, page_size: 25 }),
    recordAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1', created_at: '2026-05-24T00:00:00Z' }),
    exportUserData: vi.fn().mockResolvedValue(EXPORT_DATA),
    deleteUserData: vi.fn().mockResolvedValue(undefined),
    deleteWorkspace: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function buildApp(role = 'admin', adminServiceOverrides: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json());
  const authService = makeAuthService(role);
  const adminService = makeAdminService(adminServiceOverrides);
  app.use('/v1/admin', createAdminRouter(authService as never, adminService as never));
  return app;
}

// ---------------------------------------------------------------------------
// POST /v1/admin/data-export
// ---------------------------------------------------------------------------

describe('POST /v1/admin/data-export', () => {
  it('returns 200 with export data for admin', async () => {
    const res = await request(buildApp())
      .post('/v1/admin/data-export')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user_id');
    expect(res.body).toHaveProperty('email');
    expect(res.body).toHaveProperty('queries');
    expect(res.body).toHaveProperty('drafts');
    expect(res.body).toHaveProperty('exported_at');
  });

  it('returns 401 without authorization', async () => {
    const res = await request(buildApp()).post('/v1/admin/data-export');
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is viewer', async () => {
    const app = buildApp('viewer');
    const res = await request(app)
      .post('/v1/admin/data-export')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('returns 404 when user not found', async () => {
    const app = buildApp('admin', {
      exportUserData: vi.fn().mockRejectedValue(new Error('User not found in this workspace')),
    });
    const res = await request(app)
      .post('/v1/admin/data-export')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(404);
  });

  it('returns 500 on unexpected service error', async () => {
    const app = buildApp('admin', {
      exportUserData: vi.fn().mockRejectedValue(new Error('DB connection lost')),
    });
    const res = await request(app)
      .post('/v1/admin/data-export')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
  });

  it('records an audit log entry on success', async () => {
    const recordAuditLog = vi.fn().mockResolvedValue({ id: 'a1', created_at: '2026-05-24T00:00:00Z' });
    const app = buildApp('admin', { recordAuditLog });
    await request(app)
      .post('/v1/admin/data-export')
      .set('Authorization', 'Bearer token');
    // recordAuditLog is fire-and-forget — give it a tick to run.
    await new Promise((r) => setTimeout(r, 10));
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'gdpr.data_export' }),
    );
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/admin/users/:id/data
// ---------------------------------------------------------------------------

describe('DELETE /v1/admin/users/:id/data', () => {
  it('returns 200 with deletion confirmation', async () => {
    const res = await request(buildApp())
      .delete('/v1/admin/users/u-target/data')
      .set('Authorization', 'Bearer token')
      .send({ confirm: GDPR_CONFIRM_USER_DELETE });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('user_id', 'u-target');
    expect(res.body).toHaveProperty('deleted_at');
  });

  it('returns 400 without confirm token', async () => {
    const res = await request(buildApp())
      .delete('/v1/admin/users/u-target/data')
      .set('Authorization', 'Bearer token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Confirmation required');
  });

  it('returns 400 with wrong confirm token', async () => {
    const res = await request(buildApp())
      .delete('/v1/admin/users/u-target/data')
      .set('Authorization', 'Bearer token')
      .send({ confirm: 'WRONG_TOKEN' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without authorization', async () => {
    const res = await request(buildApp())
      .delete('/v1/admin/users/u-target/data')
      .send({ confirm: GDPR_CONFIRM_USER_DELETE });
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role', async () => {
    const res = await request(buildApp('viewer'))
      .delete('/v1/admin/users/u-target/data')
      .set('Authorization', 'Bearer token')
      .send({ confirm: GDPR_CONFIRM_USER_DELETE });
    expect(res.status).toBe(403);
  });

  it('returns 404 when user not found', async () => {
    const app = buildApp('admin', {
      deleteUserData: vi.fn().mockRejectedValue(new Error('User not found in this workspace')),
    });
    const res = await request(app)
      .delete('/v1/admin/users/nonexistent/data')
      .set('Authorization', 'Bearer token')
      .send({ confirm: GDPR_CONFIRM_USER_DELETE });
    expect(res.status).toBe(404);
  });

  it('calls deleteUserData with correct arguments', async () => {
    const deleteUserData = vi.fn().mockResolvedValue(undefined);
    const app = buildApp('admin', { deleteUserData });
    await request(app)
      .delete('/v1/admin/users/u-target/data')
      .set('Authorization', 'Bearer token')
      .send({ confirm: GDPR_CONFIRM_USER_DELETE });

    expect(deleteUserData).toHaveBeenCalledWith(
      'ws-001',
      'u-target',
      'u-admin',
      null,
    );
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/admin/workspace
// ---------------------------------------------------------------------------

describe('DELETE /v1/admin/workspace', () => {
  it('returns 200 with deletion confirmation for owner role', async () => {
    const res = await request(buildApp('owner'))
      .delete('/v1/admin/workspace')
      .set('Authorization', 'Bearer token')
      .send({ confirm: GDPR_CONFIRM_WORKSPACE_DELETE });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('workspace_id', 'ws-001');
    expect(res.body).toHaveProperty('deleted_at');
  });

  it('returns 400 without confirm token', async () => {
    const res = await request(buildApp('owner'))
      .delete('/v1/admin/workspace')
      .set('Authorization', 'Bearer token')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Confirmation required');
  });

  it('returns 403 for admin role (owner required)', async () => {
    // Admin cannot delete workspace — owner role required.
    const res = await request(buildApp('admin'))
      .delete('/v1/admin/workspace')
      .set('Authorization', 'Bearer token')
      .send({ confirm: GDPR_CONFIRM_WORKSPACE_DELETE });
    expect(res.status).toBe(403);
  });

  it('returns 401 without authorization', async () => {
    const res = await request(buildApp('owner'))
      .delete('/v1/admin/workspace')
      .send({ confirm: GDPR_CONFIRM_WORKSPACE_DELETE });
    expect(res.status).toBe(401);
  });

  it('calls deleteWorkspace with correct arguments', async () => {
    const deleteWorkspace = vi.fn().mockResolvedValue(undefined);
    const app = buildApp('owner', { deleteWorkspace });
    await request(app)
      .delete('/v1/admin/workspace')
      .set('Authorization', 'Bearer token')
      .send({ confirm: GDPR_CONFIRM_WORKSPACE_DELETE });

    expect(deleteWorkspace).toHaveBeenCalledWith(
      'ws-001',
      'u-admin',
      null,
      GDPR_CONFIRM_WORKSPACE_DELETE,
    );
  });

  it('returns 500 on service error', async () => {
    const app = buildApp('owner', {
      deleteWorkspace: vi.fn().mockRejectedValue(new Error('Database error')),
    });
    const res = await request(app)
      .delete('/v1/admin/workspace')
      .set('Authorization', 'Bearer token')
      .send({ confirm: GDPR_CONFIRM_WORKSPACE_DELETE });
    expect(res.status).toBe(500);
  });
});
