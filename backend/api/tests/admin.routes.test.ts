/**
 * Integration tests for Admin routes.
 *
 * GET  /v1/admin/connections         — admin+, 401, 500
 * PUT  /v1/admin/connections/:id     — admin+, 404, 401, 500
 * GET  /v1/admin/users               — admin+, 401, 500
 * PUT  /v1/admin/users/:id/role      — admin+, 400 (bad role), 403 (owner-only), 404, 409 (last owner), 401, 500
 * POST /v1/admin/sync/schedule       — admin+, 400 (bad type, missing cron), 401, 500
 * GET  /v1/admin/audit-logs          — admin+, 401, 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { AdminConnection, AdminUser, SyncSchedule, AuditLogResult, AuditLogEntry } from '../src/services/admin.service.js';
import { createAdminRouter } from '../src/routes/admin.js';
import {
  FIXTURE_CONNECTION,
  FIXTURE_USER,
  FIXTURE_USER_OWNER,
  FIXTURE_SYNC_SCHEDULE,
  FIXTURE_AUDIT_RESULT,
  FIXTURE_AUDIT_LOG,
} from './fixtures/admin.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeAuthService(role = 'admin') {
  return {
    verifyJwt: vi.fn().mockResolvedValue({
      user_id: 'user-001',
      workspace_id: 'ws-001',
      role,
    }),
  };
}

type MockAdminService = {
  getConnections: ReturnType<typeof vi.fn>;
  updateConnection: ReturnType<typeof vi.fn>;
  getUsers: ReturnType<typeof vi.fn>;
  updateUserRole: ReturnType<typeof vi.fn>;
  scheduleSync: ReturnType<typeof vi.fn>;
  getAuditLogs: ReturnType<typeof vi.fn>;
  recordAuditLog: ReturnType<typeof vi.fn>;
};

function makeAdminService(opts?: {
  getConnectionsResult?: AdminConnection[] | Error;
  updateConnectionResult?: AdminConnection | null | Error;
  getUsersResult?: AdminUser[] | Error;
  updateUserRoleResult?: AdminUser | null | Error;
  scheduleSyncResult?: SyncSchedule | Error;
  getAuditLogsResult?: AuditLogResult | Error;
  recordAuditLogResult?: AuditLogEntry | Error;
}): MockAdminService {
  // Use `'key' in opts` to distinguish explicitly-passed null from missing key.
  const resolve = <T>(val: T | Error) =>
    val instanceof Error
      ? vi.fn().mockRejectedValue(val)
      : vi.fn().mockResolvedValue(val);

  return {
    getConnections: resolve(
      opts && 'getConnectionsResult' in opts ? opts.getConnectionsResult! : [FIXTURE_CONNECTION],
    ),
    updateConnection: resolve(
      opts && 'updateConnectionResult' in opts ? opts.updateConnectionResult : FIXTURE_CONNECTION,
    ),
    getUsers: resolve(
      opts && 'getUsersResult' in opts ? opts.getUsersResult! : [FIXTURE_USER, FIXTURE_USER_OWNER],
    ),
    updateUserRole: resolve(
      opts && 'updateUserRoleResult' in opts ? opts.updateUserRoleResult : FIXTURE_USER,
    ),
    scheduleSync: resolve(
      opts && 'scheduleSyncResult' in opts ? opts.scheduleSyncResult! : FIXTURE_SYNC_SCHEDULE,
    ),
    getAuditLogs: resolve(
      opts && 'getAuditLogsResult' in opts ? opts.getAuditLogsResult! : FIXTURE_AUDIT_RESULT,
    ),
    recordAuditLog: resolve(
      opts && 'recordAuditLogResult' in opts ? opts.recordAuditLogResult! : FIXTURE_AUDIT_LOG,
    ),
  };
}

function buildApp(
  authService: ReturnType<typeof makeAuthService>,
  adminService: MockAdminService,
) {
  const app = express();
  app.use(express.json());
  app.use('/v1/admin', createAdminRouter(authService as never, adminService as never));
  return app;
}

// ---------------------------------------------------------------------------
// GET /v1/admin/connections
// ---------------------------------------------------------------------------

describe('GET /v1/admin/connections', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let adminService: MockAdminService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService('admin');
    adminService = makeAdminService();
  });

  it('returns 200 with connections array', async () => {
    const res = await request(buildApp(authService, adminService))
      .get('/v1/admin/connections')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('connections');
    expect(Array.isArray(res.body.connections)).toBe(true);
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(authService, adminService))
      .get('/v1/admin/connections');
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role', async () => {
    const viewerAuth = makeAuthService('viewer');
    const res = await request(buildApp(viewerAuth, adminService))
      .get('/v1/admin/connections')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('returns 403 for member role', async () => {
    const memberAuth = makeAuthService('member');
    const res = await request(buildApp(memberAuth, adminService))
      .get('/v1/admin/connections')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('returns 500 on service error', async () => {
    const service = makeAdminService({ getConnectionsResult: new Error('DB error') });
    const res = await request(buildApp(authService, service))
      .get('/v1/admin/connections')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('owner role can access connections', async () => {
    const ownerAuth = makeAuthService('owner');
    const res = await request(buildApp(ownerAuth, adminService))
      .get('/v1/admin/connections')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// PUT /v1/admin/connections/:id
// ---------------------------------------------------------------------------

describe('PUT /v1/admin/connections/:id', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let adminService: MockAdminService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService('admin');
    adminService = makeAdminService();
  });

  it('returns 200 with updated connection', async () => {
    const res = await request(buildApp(authService, adminService))
      .put('/v1/admin/connections/conn-001')
      .set('Authorization', 'Bearer token')
      .send({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'conn-001');
  });

  it('returns 404 when connection not found', async () => {
    const service = makeAdminService({ updateConnectionResult: null });
    const res = await request(buildApp(authService, service))
      .put('/v1/admin/connections/nonexistent')
      .set('Authorization', 'Bearer token')
      .send({ scopes: [] });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(authService, adminService))
      .put('/v1/admin/connections/conn-001')
      .send({ scopes: [] });
    expect(res.status).toBe(401);
  });

  it('returns 500 on service error', async () => {
    const service = makeAdminService({ updateConnectionResult: new Error('DB failure') });
    const res = await request(buildApp(authService, service))
      .put('/v1/admin/connections/conn-001')
      .set('Authorization', 'Bearer token')
      .send({ scopes: [] });
    expect(res.status).toBe(500);
  });

  it('passes workspace_id and connection_id to service', async () => {
    authService.verifyJwt.mockResolvedValue({
      user_id: 'u-1',
      workspace_id: 'ws-abc',
      role: 'admin',
    });
    await request(buildApp(authService, adminService))
      .put('/v1/admin/connections/conn-xyz')
      .set('Authorization', 'Bearer token')
      .send({});

    expect(adminService.updateConnection).toHaveBeenCalledWith('ws-abc', 'conn-xyz', expect.any(Object));
  });
});

// ---------------------------------------------------------------------------
// GET /v1/admin/users
// ---------------------------------------------------------------------------

describe('GET /v1/admin/users', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let adminService: MockAdminService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService('admin');
    adminService = makeAdminService();
  });

  it('returns 200 with users array', async () => {
    const res = await request(buildApp(authService, adminService))
      .get('/v1/admin/users')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBe(2);
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(authService, adminService))
      .get('/v1/admin/users');
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role', async () => {
    const viewerAuth = makeAuthService('viewer');
    const res = await request(buildApp(viewerAuth, adminService))
      .get('/v1/admin/users')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('returns 500 on service error', async () => {
    const service = makeAdminService({ getUsersResult: new Error('Query failed') });
    const res = await request(buildApp(authService, service))
      .get('/v1/admin/users')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PUT /v1/admin/users/:id/role
// ---------------------------------------------------------------------------

describe('PUT /v1/admin/users/:id/role', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let adminService: MockAdminService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService('admin');
    adminService = makeAdminService();
  });

  it('returns 200 with updated user on valid role change', async () => {
    const res = await request(buildApp(authService, adminService))
      .put('/v1/admin/users/user-001/role')
      .set('Authorization', 'Bearer token')
      .send({ role: 'member' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('role');
  });

  it('returns 400 for invalid role value', async () => {
    const res = await request(buildApp(authService, adminService))
      .put('/v1/admin/users/user-001/role')
      .set('Authorization', 'Bearer token')
      .send({ role: 'superadmin' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid role');
  });

  it('returns 403 when service throws owner-only error', async () => {
    const service = makeAdminService({
      updateUserRoleResult: new Error('Only owners can assign the owner role'),
    });
    const res = await request(buildApp(authService, service))
      .put('/v1/admin/users/user-001/role')
      .set('Authorization', 'Bearer token')
      .send({ role: 'owner' });

    expect(res.status).toBe(403);
  });

  it('returns 404 when user not found', async () => {
    const service = makeAdminService({ updateUserRoleResult: null });
    const res = await request(buildApp(authService, service))
      .put('/v1/admin/users/nobody/role')
      .set('Authorization', 'Bearer token')
      .send({ role: 'member' });

    expect(res.status).toBe(404);
  });

  it('returns 409 when demoting last owner', async () => {
    const service = makeAdminService({
      updateUserRoleResult: new Error('Cannot remove the last owner of a workspace'),
    });
    const res = await request(buildApp(authService, service))
      .put('/v1/admin/users/user-owner/role')
      .set('Authorization', 'Bearer token')
      .send({ role: 'admin' });

    expect(res.status).toBe(409);
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(authService, adminService))
      .put('/v1/admin/users/user-001/role')
      .send({ role: 'member' });
    expect(res.status).toBe(401);
  });

  it('passes workspace_id, target user, new role, and requesting role to service', async () => {
    authService.verifyJwt.mockResolvedValue({
      user_id: 'u-admin',
      workspace_id: 'ws-role',
      role: 'admin',
    });
    await request(buildApp(authService, adminService))
      .put('/v1/admin/users/target-user/role')
      .set('Authorization', 'Bearer token')
      .send({ role: 'viewer' });

    expect(adminService.updateUserRole).toHaveBeenCalledWith(
      'ws-role', 'target-user', 'viewer', 'admin',
    );
  });
});

// ---------------------------------------------------------------------------
// POST /v1/admin/sync/schedule
// ---------------------------------------------------------------------------

describe('POST /v1/admin/sync/schedule', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let adminService: MockAdminService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService('admin');
    adminService = makeAdminService();
  });

  it('returns 200 for hourly schedule', async () => {
    const res = await request(buildApp(authService, adminService))
      .post('/v1/admin/sync/schedule')
      .set('Authorization', 'Bearer token')
      .send({ schedule_type: 'hourly' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('schedule_type');
  });

  it('returns 200 for daily schedule', async () => {
    const res = await request(buildApp(authService, adminService))
      .post('/v1/admin/sync/schedule')
      .set('Authorization', 'Bearer token')
      .send({ schedule_type: 'daily' });

    expect(res.status).toBe(200);
  });

  it('returns 200 for custom schedule with valid cron', async () => {
    const res = await request(buildApp(authService, adminService))
      .post('/v1/admin/sync/schedule')
      .set('Authorization', 'Bearer token')
      .send({ schedule_type: 'custom', cron_expression: '*/30 * * * *' });

    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid schedule_type', async () => {
    const res = await request(buildApp(authService, adminService))
      .post('/v1/admin/sync/schedule')
      .set('Authorization', 'Bearer token')
      .send({ schedule_type: 'weekly' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('schedule_type');
  });

  it('returns 400 for custom schedule without cron_expression', async () => {
    const res = await request(buildApp(authService, adminService))
      .post('/v1/admin/sync/schedule')
      .set('Authorization', 'Bearer token')
      .send({ schedule_type: 'custom' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('cron_expression');
  });

  it('returns 400 when service throws invalid cron error', async () => {
    const service = makeAdminService({
      scheduleSyncResult: new Error('Invalid cron expression'),
    });
    const res = await request(buildApp(authService, service))
      .post('/v1/admin/sync/schedule')
      .set('Authorization', 'Bearer token')
      .send({ schedule_type: 'custom', cron_expression: 'bad cron' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(authService, adminService))
      .post('/v1/admin/sync/schedule')
      .send({ schedule_type: 'daily' });
    expect(res.status).toBe(401);
  });

  it('returns 500 on unexpected service error', async () => {
    const service = makeAdminService({
      scheduleSyncResult: new Error('DB connection lost'),
    });
    const res = await request(buildApp(authService, service))
      .post('/v1/admin/sync/schedule')
      .set('Authorization', 'Bearer token')
      .send({ schedule_type: 'daily' });

    expect(res.status).toBe(500);
  });

  it('passes workspace_id and schedule_type to service', async () => {
    authService.verifyJwt.mockResolvedValue({
      user_id: 'u-1',
      workspace_id: 'ws-sync',
      role: 'admin',
    });
    await request(buildApp(authService, adminService))
      .post('/v1/admin/sync/schedule')
      .set('Authorization', 'Bearer token')
      .send({ schedule_type: 'hourly' });

    expect(adminService.scheduleSync).toHaveBeenCalledWith('ws-sync', 'hourly', undefined);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/admin/audit-logs
// ---------------------------------------------------------------------------

describe('GET /v1/admin/audit-logs', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let adminService: MockAdminService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService('admin');
    adminService = makeAdminService();
  });

  it('returns 200 with paginated audit log result', async () => {
    const res = await request(buildApp(authService, adminService))
      .get('/v1/admin/audit-logs')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('entries');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('page_size');
  });

  it('passes query filters to service', async () => {
    authService.verifyJwt.mockResolvedValue({
      user_id: 'u-1',
      workspace_id: 'ws-audit',
      role: 'admin',
    });
    await request(buildApp(authService, adminService))
      .get('/v1/admin/audit-logs?user_id=u-filter&action=admin.role_change&page=2&page_size=10')
      .set('Authorization', 'Bearer token');

    expect(adminService.getAuditLogs).toHaveBeenCalledWith('ws-audit', {
      user_id: 'u-filter',
      action: 'admin.role_change',
      from: undefined,
      to: undefined,
      page: 2,
      page_size: 10,
    });
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildApp(authService, adminService))
      .get('/v1/admin/audit-logs');
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role', async () => {
    const viewerAuth = makeAuthService('viewer');
    const res = await request(buildApp(viewerAuth, adminService))
      .get('/v1/admin/audit-logs')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(403);
  });

  it('returns 500 on service error', async () => {
    const service = makeAdminService({ getAuditLogsResult: new Error('Query timeout') });
    const res = await request(buildApp(authService, service))
      .get('/v1/admin/audit-logs')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
  });

  it('owner role can access audit logs', async () => {
    const ownerAuth = makeAuthService('owner');
    const res = await request(buildApp(ownerAuth, adminService))
      .get('/v1/admin/audit-logs')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });
});
