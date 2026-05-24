/**
 * Integration tests — Documents endpoints (/v1/documents)
 *
 * Tests:
 *   - GET /v1/documents — returns workspace documents (authenticated)
 *   - RBAC: viewer can read, verify unauthorized access is blocked (401/403)
 *   - Response shape validation
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import {
  getTestApp,
  bearerFor,
  WS_A_ID,
  WS_B_ID,
  USER_ADMIN_ID,
  USER_VIEWER_ID,
  USER_B_ADMIN_ID,
} from './helpers.js';

describe('Documents — GET /v1/documents', () => {
  it('returns 401 without Authorization header', async () => {
    const app = getTestApp();

    const res = await request(app).get('/v1/documents');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 with an invalid Bearer token', async () => {
    const app = getTestApp();

    const res = await request(app)
      .get('/v1/documents')
      .set('Authorization', 'Bearer not-a-valid-jwt');

    expect(res.status).toBe(401);
  });

  it('returns 200 with documents array for authenticated admin', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app).get('/v1/documents').set(headers);

    expect(res.status).toBe(200);
    // Response should contain documents array or files array
    const hasDocuments = 'documents' in res.body || 'files' in res.body;
    expect(hasDocuments).toBe(true);
  });

  it('returns 200 for viewer role (read access allowed)', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_VIEWER_ID,
      workspace_id: WS_A_ID,
      email: 'viewer@test.boba',
      role: 'viewer',
    });

    const res = await request(app).get('/v1/documents').set(headers);

    // Viewer has read access
    expect(res.status).toBe(200);
  });

  it('documents response contains seeded document for workspace A', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app).get('/v1/documents').set(headers);

    expect(res.status).toBe(200);
    const docs = res.body.documents ?? res.body.files ?? [];
    const docNames = docs.map((d: { name: string }) => d.name);
    expect(docNames).toContain('Test Document A.pdf');
  });

  it('workspace A documents do NOT contain workspace B document', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app).get('/v1/documents').set(headers);

    expect(res.status).toBe(200);
    const docs = res.body.documents ?? res.body.files ?? [];
    const docNames = docs.map((d: { name: string }) => d.name);
    // Workspace B's document must NOT appear for workspace A users
    expect(docNames).not.toContain('Workspace B Secret.pdf');
  });
});

describe('Documents — RBAC enforcement', () => {
  it('returns 401 when Authorization header is missing entirely', async () => {
    const app = getTestApp();

    const res = await request(app).get('/v1/documents');
    expect(res.status).toBe(401);
  });

  it('workspace B admin cannot see workspace A documents via direct JWT swap', async () => {
    const app = getTestApp();
    // User from workspace B tries to access /v1/documents — they should only see their workspace's docs
    const headersB = await bearerFor({
      user_id: USER_B_ADMIN_ID,
      workspace_id: WS_B_ID,
      email: 'admin-b@test.boba',
      role: 'admin',
    });

    const res = await request(app).get('/v1/documents').set(headersB);

    expect(res.status).toBe(200);
    const docs = res.body.documents ?? res.body.files ?? [];
    const docNames = docs.map((d: { name: string }) => d.name);
    // Workspace A's document must NOT appear for workspace B users
    expect(docNames).not.toContain('Test Document A.pdf');
  });
});
