/**
 * Integration tests — Admin endpoints (/v1/admin)
 *
 * Tests:
 *   - GET /v1/admin/connections — list Drive connections (admin only)
 *   - GET /v1/admin/users — list workspace members (admin only)
 *   - GET /v1/admin/audit-logs — paginated audit log with search
 *   - POST /v1/admin/sync/schedule — configure sync schedule
 *   - RBAC: viewer and member roles receive 403
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import {
  getTestApp,
  bearerFor,
  WS_A_ID,
  USER_ADMIN_ID,
  USER_MEMBER_ID,
  USER_VIEWER_ID,
} from './helpers.js';

// ---------------------------------------------------------------------------
// GET /v1/admin/connections
// ---------------------------------------------------------------------------

describe('Admin — GET /v1/admin/connections', () => {
  it('returns 401 without authorization', async () => {
    const app = getTestApp();

    const res = await request(app).get('/v1/admin/connections');
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_VIEWER_ID,
      workspace_id: WS_A_ID,
      email: 'viewer@test.boba',
      role: 'viewer',
    });

    const res = await request(app).get('/v1/admin/connections').set(headers);
    expect(res.status).toBe(403);
  });

  it('returns 403 for member role', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_MEMBER_ID,
      workspace_id: WS_A_ID,
      email: 'member@test.boba',
      role: 'member',
    });

    const res = await request(app).get('/v1/admin/connections').set(headers);
    expect(res.status).toBe(403);
  });

  it('returns 200 with connections array for admin role', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app).get('/v1/admin/connections').set(headers);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('connections');
    expect(Array.isArray(res.body.connections)).toBe(true);
  });

  it('connections array contains the seeded Drive connection', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app).get('/v1/admin/connections').set(headers);
    expect(res.status).toBe(200);

    const connections = res.body.connections as Array<{ email: string; status: string }>;
    const connection = connections.find((c) => c.email === 'admin@test.boba');
    expect(connection).toBeDefined();
    expect(connection?.status).toBe('connected');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/admin/users
// ---------------------------------------------------------------------------

describe('Admin — GET /v1/admin/users', () => {
  it('returns 401 without authorization', async () => {
    const app = getTestApp();

    const res = await request(app).get('/v1/admin/users');
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_VIEWER_ID,
      workspace_id: WS_A_ID,
      email: 'viewer@test.boba',
      role: 'viewer',
    });

    const res = await request(app).get('/v1/admin/users').set(headers);
    expect(res.status).toBe(403);
  });

  it('returns 200 with users array for admin role', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app).get('/v1/admin/users').set(headers);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('users list contains all three seeded workspace A members', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app).get('/v1/admin/users').set(headers);
    expect(res.status).toBe(200);

    const users = res.body.users as Array<{ email: string }>;
    const emails = users.map((u) => u.email);
    expect(emails).toContain('admin@test.boba');
    expect(emails).toContain('member@test.boba');
    expect(emails).toContain('viewer@test.boba');
  });

  it('users list does NOT contain workspace B users', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app).get('/v1/admin/users').set(headers);
    expect(res.status).toBe(200);

    const users = res.body.users as Array<{ email: string }>;
    const emails = users.map((u) => u.email);
    // Workspace B admin must NOT appear
    expect(emails).not.toContain('admin-b@test.boba');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/admin/audit-logs
// ---------------------------------------------------------------------------

describe('Admin — GET /v1/admin/audit-logs', () => {
  it('returns 401 without authorization', async () => {
    const app = getTestApp();

    const res = await request(app).get('/v1/admin/audit-logs');
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_VIEWER_ID,
      workspace_id: WS_A_ID,
      email: 'viewer@test.boba',
      role: 'viewer',
    });

    const res = await request(app).get('/v1/admin/audit-logs').set(headers);
    expect(res.status).toBe(403);
  });

  it('returns 200 with audit logs for admin', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app).get('/v1/admin/audit-logs').set(headers);
    expect(res.status).toBe(200);
    // Response may use 'audit_logs', 'logs', or 'entries' key
    const hasLogs =
      'audit_logs' in res.body ||
      'logs' in res.body ||
      'entries' in res.body;
    expect(hasLogs).toBe(true);
  });

  it('audit logs contain the seeded drive_connected entry', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app).get('/v1/admin/audit-logs').set(headers);
    expect(res.status).toBe(200);

    const logs = (res.body.audit_logs ?? res.body.logs ?? res.body.entries) as Array<{
      action: string;
    }>;
    const actions = logs.map((l) => l.action);
    expect(actions).toContain('drive_connected');
  });

  it('supports pagination via page and limit query params', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app)
      .get('/v1/admin/audit-logs?page=1&limit=10')
      .set(headers);

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/admin/sync/schedule
// ---------------------------------------------------------------------------

describe('Admin — POST /v1/admin/sync/schedule', () => {
  it('returns 401 without authorization', async () => {
    const app = getTestApp();

    const res = await request(app)
      .post('/v1/admin/sync/schedule')
      .send({ schedule_type: 'daily' });

    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_VIEWER_ID,
      workspace_id: WS_A_ID,
      email: 'viewer@test.boba',
      role: 'viewer',
    });

    const res = await request(app)
      .post('/v1/admin/sync/schedule')
      .set(headers)
      .send({ schedule_type: 'daily' });

    expect(res.status).toBe(403);
  });

  it('returns 200 or 400 for admin (valid schedule type)', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app)
      .post('/v1/admin/sync/schedule')
      .set(headers)
      .send({ schedule_type: 'daily' });

    // Admin can schedule sync — may be 200/201 or 404 if no connection exists yet
    expect([200, 201, 404]).toContain(res.status);
  });

  it('returns 400 for unsupported schedule type', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app)
      .post('/v1/admin/sync/schedule')
      .set(headers)
      .send({ schedule_type: 'every-second' });

    expect([400, 422]).toContain(res.status);
  });
});
