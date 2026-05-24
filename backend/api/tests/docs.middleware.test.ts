/**
 * Tests for the API documentation middleware (docs.middleware.ts).
 *
 * Covers:
 *   - GET /api-spec.json  returns valid JSON with openapi: '3.0.3' header
 *   - GET /docs           returns Swagger UI HTML in non-production
 *   - GET /docs           returns 404 in production
 *   - Spec structure: paths, components, securitySchemes present
 *   - Spec version field
 *   - HTML contains expected CDN scripts and spec URL reference
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express, { type Application } from 'express';
import request from 'supertest';
import { createDocsRouter } from '../src/middleware/docs.middleware.js';
import { openApiSpec } from '../src/openapi.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp(isProd: boolean): Application {
  const app = express();
  app.use('/', createDocsRouter(isProd));
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return app;
}

// ---------------------------------------------------------------------------
// Suite: /api-spec.json
// ---------------------------------------------------------------------------

describe('GET /api-spec.json', () => {
  let app: Application;

  beforeEach(() => {
    app = buildApp(false); // non-prod
  });

  it('returns 200 with Content-Type application/json', async () => {
    const res = await request(app).get('/api-spec.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('returns the spec with openapi: 3.0.3', async () => {
    const res = await request(app).get('/api-spec.json');
    expect(res.body.openapi).toBe('3.0.3');
  });

  it('spec body has a paths object with at least one entry', async () => {
    const res = await request(app).get('/api-spec.json');
    expect(res.body.paths).toBeDefined();
    expect(Object.keys(res.body.paths).length).toBeGreaterThan(0);
  });

  it('spec body has components.securitySchemes.BearerAuth', async () => {
    const res = await request(app).get('/api-spec.json');
    expect(res.body.components?.securitySchemes?.BearerAuth).toBeDefined();
    expect(res.body.components.securitySchemes.BearerAuth.scheme).toBe('bearer');
  });

  it('spec body has info.title and info.version', async () => {
    const res = await request(app).get('/api-spec.json');
    expect(res.body.info?.title).toBeTruthy();
    expect(res.body.info?.version).toBeTruthy();
  });

  it('spec matches the imported openApiSpec constant', async () => {
    const res = await request(app).get('/api-spec.json');
    // Stringify both to compare deeply without worrying about object identity.
    expect(JSON.stringify(res.body)).toBe(JSON.stringify(openApiSpec));
  });

  it('is also available in production mode', async () => {
    const prodApp = buildApp(true);
    const res = await request(prodApp).get('/api-spec.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
  });
});

// ---------------------------------------------------------------------------
// Suite: GET /docs — non-production
// ---------------------------------------------------------------------------

describe('GET /docs (non-production)', () => {
  let app: Application;

  beforeEach(() => {
    app = buildApp(false);
  });

  it('returns 200 with Content-Type text/html', async () => {
    const res = await request(app).get('/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('HTML contains a reference to /api-spec.json', async () => {
    const res = await request(app).get('/docs');
    expect(res.text).toContain('/api-spec.json');
  });

  it('HTML contains the swagger-ui-bundle script tag', async () => {
    const res = await request(app).get('/docs');
    expect(res.text).toContain('swagger-ui-bundle.js');
  });

  it('HTML contains the swagger-ui CSS link', async () => {
    const res = await request(app).get('/docs');
    expect(res.text).toContain('swagger-ui.css');
  });

  it('HTML contains the swagger-ui div mount point', async () => {
    const res = await request(app).get('/docs');
    expect(res.text).toContain('id="swagger-ui"');
  });

  it('HTML contains the SwaggerUIBundle initialisation call', async () => {
    const res = await request(app).get('/docs');
    expect(res.text).toContain('SwaggerUIBundle');
  });

  it('HTML has a proper DOCTYPE', async () => {
    const res = await request(app).get('/docs');
    expect(res.text.trimStart()).toMatch(/^<!DOCTYPE html>/i);
  });
});

// ---------------------------------------------------------------------------
// Suite: GET /docs — production
// ---------------------------------------------------------------------------

describe('GET /docs (production)', () => {
  let app: Application;

  beforeEach(() => {
    app = buildApp(true); // isProd = true
  });

  it('returns 404', async () => {
    const res = await request(app).get('/docs');
    expect(res.status).toBe(404);
  });

  it('response body has an error field', async () => {
    const res = await request(app).get('/docs');
    expect(res.body.error).toBeTruthy();
  });

  it('does NOT return HTML in production', async () => {
    const res = await request(app).get('/docs');
    expect(res.headers['content-type']).not.toMatch(/text\/html/);
  });
});

// ---------------------------------------------------------------------------
// Suite: openApiSpec structural validation (import-level)
// ---------------------------------------------------------------------------

describe('openApiSpec structure', () => {
  it('has openapi field 3.0.3', () => {
    expect(openApiSpec.openapi).toBe('3.0.3');
  });

  it('has info with title and version', () => {
    expect(openApiSpec.info.title).toBeTruthy();
    expect(openApiSpec.info.version).toBeTruthy();
  });

  it('has at least one server entry', () => {
    expect(Array.isArray(openApiSpec.servers)).toBe(true);
    expect((openApiSpec.servers as unknown[]).length).toBeGreaterThan(0);
  });

  it('has paths object with entries', () => {
    const paths = openApiSpec.paths as Record<string, unknown>;
    expect(Object.keys(paths).length).toBeGreaterThan(0);
  });

  it('includes /v1/auth/callback path', () => {
    const paths = openApiSpec.paths as Record<string, unknown>;
    expect(paths['/v1/auth/callback']).toBeDefined();
  });

  it('includes /v1/ask path', () => {
    const paths = openApiSpec.paths as Record<string, unknown>;
    expect(paths['/v1/ask']).toBeDefined();
  });

  it('includes /v1/documents path', () => {
    const paths = openApiSpec.paths as Record<string, unknown>;
    expect(paths['/v1/documents']).toBeDefined();
  });

  it('has components.schemas defined', () => {
    const schemas = (openApiSpec.components as Record<string, unknown>)?.schemas as Record<string, unknown>;
    expect(schemas).toBeDefined();
    expect(Object.keys(schemas).length).toBeGreaterThan(0);
  });

  it('has Error schema with required error property', () => {
    const schemas = (openApiSpec.components as Record<string, unknown>)?.schemas as Record<string, unknown>;
    const error = schemas['Error'] as Record<string, unknown>;
    expect(error).toBeDefined();
    expect((error['required'] as string[]).includes('error')).toBe(true);
  });

  it('has tags array', () => {
    const tags = openApiSpec.tags as unknown[];
    expect(Array.isArray(tags)).toBe(true);
    expect(tags.length).toBeGreaterThan(0);
  });
});
