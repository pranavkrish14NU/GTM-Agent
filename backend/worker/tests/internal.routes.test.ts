/**
 * Route tests for the worker's internal endpoints.
 *
 * Uses supertest to send real HTTP requests against the Express app.
 * FileProcessingService is fully mocked.
 *
 * Coverage:
 *   GET /health
 *   ✓ returns 200 with service name
 *
 *   POST /internal/file-process
 *   ✓ returns 200 { status: 'processed' } on success
 *   ✓ returns 200 { status: 'skipped' } when document unchanged
 *   ✓ returns 200 { status: 'permanent_failure' } on permanent failure
 *   ✓ returns 500 on transient error (Cloud Tasks will retry)
 *   ✓ returns 400 when payload field is missing
 *   ✓ returns 400 when payload is not valid base64 JSON
 *   ✓ returns 400 when decoded payload is missing required fields
 *
 *   POST /internal/drive-sync
 *   ✓ returns 200 with accepted message
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createInternalRouter } from '../src/routes/internal.js';
import type { FileProcessingService } from '../src/services/file-processing.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePayload(overrides?: Partial<{
  documentId: string;
  workspaceId: string;
  driveFileId: string;
  mimeType: string;
  connectionId: string;
}>) {
  return Buffer.from(
    JSON.stringify({
      documentId: 'doc-001',
      workspaceId: 'ws-001',
      driveFileId: 'drive-001',
      mimeType: 'application/vnd.google-apps.document',
      connectionId: 'conn-001',
      ...overrides,
    }),
  ).toString('base64');
}

function makeApp(serviceOverrides: Partial<FileProcessingService>) {
  const mockService = {
    processFile: vi.fn(async () => ({ status: 'processed', chunksWritten: 5 })),
    ...serviceOverrides,
  } as unknown as FileProcessingService;

  const app = express();
  app.use(express.json());
  app.use('/internal', createInternalRouter(mockService));
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'boba-worker' }));
  return { app, mockService };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 with service name', async () => {
    const { app } = makeApp({});
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('boba-worker');
  });
});

describe('POST /internal/file-process', () => {
  it('returns 200 with processed status on success', async () => {
    const { app } = makeApp({
      processFile: vi.fn(async () => ({ status: 'processed', chunksWritten: 7 })),
    });
    const res = await request(app)
      .post('/internal/file-process')
      .send({ payload: makePayload() });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('processed');
    expect(res.body.chunksWritten).toBe(7);
  });

  it('returns 200 with skipped status when document unchanged', async () => {
    const { app } = makeApp({
      processFile: vi.fn(async () => ({ status: 'skipped', reason: 'content unchanged' })),
    });
    const res = await request(app)
      .post('/internal/file-process')
      .send({ payload: makePayload() });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('skipped');
  });

  it('returns 200 with permanent_failure status (no retry)', async () => {
    const { app } = makeApp({
      processFile: vi.fn(async () => ({
        status: 'permanent_failure',
        reason: 'Document not found',
      })),
    });
    const res = await request(app)
      .post('/internal/file-process')
      .send({ payload: makePayload() });
    // 200 so Cloud Tasks does NOT retry
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('permanent_failure');
  });

  it('returns 500 on transient error (Cloud Tasks will retry)', async () => {
    const { app } = makeApp({
      processFile: vi.fn(async () => { throw new Error('DB connection lost'); }),
    });
    const res = await request(app)
      .post('/internal/file-process')
      .send({ payload: makePayload() });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/DB connection lost/);
  });

  it('returns 400 when payload field is missing', async () => {
    const { app } = makeApp({});
    const res = await request(app)
      .post('/internal/file-process')
      .send({ notPayload: 'something' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing payload/);
  });

  it('returns 400 when payload is not valid base64 JSON', async () => {
    const { app } = makeApp({});
    const res = await request(app)
      .post('/internal/file-process')
      .send({ payload: '!!!not-base64-json!!!' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/base64/i);
  });

  it('returns 400 when decoded payload is missing required fields', async () => {
    const incompletePayload = Buffer.from(
      JSON.stringify({ documentId: 'doc-001' }), // missing workspaceId etc.
    ).toString('base64');
    const { app } = makeApp({});
    const res = await request(app)
      .post('/internal/file-process')
      .send({ payload: incompletePayload });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required fields/i);
  });

  it('calls processFile with the decoded payload', async () => {
    const { app, mockService } = makeApp({});
    await request(app)
      .post('/internal/file-process')
      .send({ payload: makePayload() });
    expect(mockService.processFile).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'doc-001', workspaceId: 'ws-001' }),
    );
  });
});

describe('POST /internal/drive-sync', () => {
  it('returns 200 with accepted message', async () => {
    const { app } = makeApp({});
    const res = await request(app)
      .post('/internal/drive-sync')
      .send({ payload: makePayload() });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('accepted');
  });
});
