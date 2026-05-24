/**
 * Integration tests — Content Studio endpoints (/v1/content)
 *
 * Tests:
 *   - POST /v1/content/generate — generate content with the MockLLMProvider
 *   - Authentication enforcement
 *   - Response shape validation (title, body, scores)
 *   - RBAC: viewer reads but cannot write (blockViewerWrites)
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

const VALID_GENERATE_BODY = {
  content_type: 'blog_post',
  tone: 'professional',
  length: 'medium',
  channel: 'website',
  topic: 'How BOBA transforms B2B marketing intelligence',
};

describe('Content Studio — POST /v1/content/generate', () => {
  it('returns 401 without authorization', async () => {
    const app = getTestApp();

    const res = await request(app)
      .post('/v1/content/generate')
      .send(VALID_GENERATE_BODY);

    expect(res.status).toBe(401);
  });

  it('returns 400 when topic is missing', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app)
      .post('/v1/content/generate')
      .set(headers)
      .send({ content_type: 'blog_post' });

    expect([400, 422]).toContain(res.status);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 200 with generated content for admin', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app)
      .post('/v1/content/generate')
      .set(headers)
      .send(VALID_GENERATE_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('title');
    expect(res.body).toHaveProperty('body');
    expect(typeof res.body.title).toBe('string');
    expect(typeof res.body.body).toBe('string');
  });

  it('returns 200 with brand_voice_score in response', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app)
      .post('/v1/content/generate')
      .set(headers)
      .send(VALID_GENERATE_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('brand_voice_score');
    expect(typeof res.body.brand_voice_score).toBe('number');
  });

  it('returns 200 with persona_fit_score in response', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app)
      .post('/v1/content/generate')
      .set(headers)
      .send(VALID_GENERATE_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('persona_fit_score');
    expect(typeof res.body.persona_fit_score).toBe('number');
  });

  it('member role can generate content', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_MEMBER_ID,
      workspace_id: WS_A_ID,
      email: 'member@test.boba',
      role: 'member',
    });

    const res = await request(app)
      .post('/v1/content/generate')
      .set(headers)
      .send(VALID_GENERATE_BODY);

    // Member has write access — should be 200
    expect([200, 201]).toContain(res.status);
  });

  it('viewer role cannot generate content (blockViewerWrites)', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_VIEWER_ID,
      workspace_id: WS_A_ID,
      email: 'viewer@test.boba',
      role: 'viewer',
    });

    const res = await request(app)
      .post('/v1/content/generate')
      .set(headers)
      .send(VALID_GENERATE_BODY);

    // Viewer cannot write — expect 403 Forbidden
    expect(res.status).toBe(403);
  });
});

describe('Content Studio — GET /v1/content/drafts', () => {
  it('returns 401 without authorization', async () => {
    const app = getTestApp();

    const res = await request(app).get('/v1/content/drafts');
    expect(res.status).toBe(401);
  });

  it('returns 200 with drafts array for authenticated user', async () => {
    const app = getTestApp();
    const headers = await bearerFor({
      user_id: USER_ADMIN_ID,
      workspace_id: WS_A_ID,
      email: 'admin@test.boba',
      role: 'admin',
    });

    const res = await request(app).get('/v1/content/drafts').set(headers);
    expect(res.status).toBe(200);
    // Response should have a drafts array (may be empty if no drafts yet)
    const hasDrafts = 'drafts' in res.body || Array.isArray(res.body);
    expect(hasDrafts).toBe(true);
  });
});
