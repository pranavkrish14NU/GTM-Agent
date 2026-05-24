/**
 * Integration tests for export routes.
 *
 * POST /v1/content/drafts/:id/export — member+, 400 on bad format, 404 on missing draft, 401, 403, 500
 * GET  /v1/drive/folders             — viewer+, 503 on no connection, 401, 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createContentRouter } from '../src/routes/content.js';
import { createDriveRouter } from '../src/routes/drive.js';
import type { ExportResult } from '../src/services/export.service.js';
import {
  FIXTURE_EXPORT_RESULT,
  FIXTURE_DRIVE_FOLDERS,
} from './fixtures/export.js';
import { FIXTURE_DRAFT_BLOG } from './fixtures/content.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeAuthService(role = 'viewer') {
  return {
    verifyJwt: vi.fn().mockResolvedValue({ user_id: 'user-001', workspace_id: 'ws-001', role }),
  };
}

type MockContentService = {
  getDrafts: ReturnType<typeof vi.fn>;
  getDraft: ReturnType<typeof vi.fn>;
  generateContent: ReturnType<typeof vi.fn>;
  refineDraft: ReturnType<typeof vi.fn>;
};

function makeContentService(): MockContentService {
  return {
    getDrafts: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, page_size: 20 }),
    getDraft: vi.fn().mockResolvedValue(FIXTURE_DRAFT_BLOG),
    generateContent: vi.fn().mockResolvedValue(FIXTURE_DRAFT_BLOG),
    refineDraft: vi.fn().mockResolvedValue(FIXTURE_DRAFT_BLOG),
  };
}

type MockExportService = {
  exportDraft: ReturnType<typeof vi.fn>;
  getExportStatus: ReturnType<typeof vi.fn>;
  getDriveFolders: ReturnType<typeof vi.fn>;
};

function makeExportService(opts?: {
  exportResult?: ExportResult | Error;
  foldersResult?: typeof FIXTURE_DRIVE_FOLDERS | Error;
}): MockExportService {
  return {
    exportDraft: vi.fn().mockImplementation(async () => {
      if (opts && 'exportResult' in opts) {
        const r = opts.exportResult;
        if (r instanceof Error) throw r;
        return r;
      }
      return FIXTURE_EXPORT_RESULT;
    }),
    getExportStatus: vi.fn().mockResolvedValue(null),
    getDriveFolders: vi.fn().mockImplementation(async () => {
      if (opts && 'foldersResult' in opts) {
        const r = opts.foldersResult;
        if (r instanceof Error) throw r;
        return r;
      }
      return FIXTURE_DRIVE_FOLDERS;
    }),
  };
}

function buildContentApp(
  authService: ReturnType<typeof makeAuthService>,
  contentService: MockContentService,
  exportService: MockExportService,
) {
  const app = express();
  app.use(express.json());
  app.use(
    '/v1/content',
    createContentRouter(authService as never, contentService as never, exportService as never),
  );
  return app;
}

function buildDriveApp(
  authService: ReturnType<typeof makeAuthService>,
  exportService: MockExportService,
) {
  const app = express();
  app.use(express.json());
  app.use('/v1/drive', createDriveRouter(authService as never, exportService as never));
  return app;
}

// ---------------------------------------------------------------------------
// POST /v1/content/drafts/:id/export
// ---------------------------------------------------------------------------

describe('POST /v1/content/drafts/:id/export', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let contentService: MockContentService;
  let exportService: MockExportService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService('member');
    contentService = makeContentService();
    exportService = makeExportService();
  });

  it('returns 201 with ExportResult for member role', async () => {
    const res = await request(buildContentApp(authService, contentService, exportService))
      .post('/v1/content/drafts/draft-001/export')
      .set('Authorization', 'Bearer token')
      .send({ format: 'gdoc', folderId: 'folder-001' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('exportId');
    expect(res.body).toHaveProperty('status', 'completed');
    expect(res.body).toHaveProperty('fileId');
    expect(res.body).toHaveProperty('webViewLink');
    expect(res.body).toHaveProperty('format', 'gdoc');
    expect(res.body).toHaveProperty('exportedAt');
  });

  it('returns 201 for pdf format', async () => {
    const res = await request(buildContentApp(authService, contentService, exportService))
      .post('/v1/content/drafts/draft-001/export')
      .set('Authorization', 'Bearer token')
      .send({ format: 'pdf' });

    expect(res.status).toBe(201);
  });

  it('returns 400 when format is missing', async () => {
    const res = await request(buildContentApp(authService, contentService, exportService))
      .post('/v1/content/drafts/draft-001/export')
      .set('Authorization', 'Bearer token')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when format is invalid', async () => {
    const res = await request(buildContentApp(authService, contentService, exportService))
      .post('/v1/content/drafts/draft-001/export')
      .set('Authorization', 'Bearer token')
      .send({ format: 'word' });
    expect(res.status).toBe(400);
  });

  it('returns 403 for viewer role', async () => {
    const auth = makeAuthService('viewer');
    const res = await request(buildContentApp(auth, contentService, exportService))
      .post('/v1/content/drafts/draft-001/export')
      .set('Authorization', 'Bearer token')
      .send({ format: 'gdoc' });
    expect(res.status).toBe(403);
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildContentApp(authService, contentService, exportService))
      .post('/v1/content/drafts/draft-001/export')
      .send({ format: 'gdoc' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when draft not found', async () => {
    const service = makeExportService({
      exportResult: new Error('Content draft not found: missing-id'),
    });
    const res = await request(buildContentApp(authService, contentService, service))
      .post('/v1/content/drafts/missing-id/export')
      .set('Authorization', 'Bearer token')
      .send({ format: 'gdoc' });
    expect(res.status).toBe(404);
  });

  it('returns 500 on Drive API error', async () => {
    const service = makeExportService({ exportResult: new Error('Drive API failed') });
    const res = await request(buildContentApp(authService, contentService, service))
      .post('/v1/content/drafts/draft-001/export')
      .set('Authorization', 'Bearer token')
      .send({ format: 'gdoc' });
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Drive API failed');
  });

  it('passes workspace_id, user_id, draftId, folderId, format to exportDraft', async () => {
    authService.verifyJwt.mockResolvedValue({
      user_id: 'u-abc',
      workspace_id: 'ws-xyz',
      role: 'member',
    });
    await request(buildContentApp(authService, contentService, exportService))
      .post('/v1/content/drafts/draft-999/export')
      .set('Authorization', 'Bearer token')
      .send({ format: 'pdf', folderId: 'folder-002' });

    expect(exportService.exportDraft).toHaveBeenCalledWith(
      'ws-xyz',
      'u-abc',
      'draft-999',
      'folder-002',
      'pdf',
    );
  });

  it('admin role can export', async () => {
    const auth = makeAuthService('admin');
    const res = await request(buildContentApp(auth, contentService, exportService))
      .post('/v1/content/drafts/draft-001/export')
      .set('Authorization', 'Bearer token')
      .send({ format: 'gdoc' });
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/drive/folders
// ---------------------------------------------------------------------------

describe('GET /v1/drive/folders', () => {
  let authService: ReturnType<typeof makeAuthService>;
  let exportService: MockExportService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = makeAuthService('viewer');
    exportService = makeExportService();
  });

  it('returns 200 with folders array', async () => {
    const res = await request(buildDriveApp(authService, exportService))
      .get('/v1/drive/folders')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('folders');
    expect(Array.isArray(res.body.folders)).toBe(true);
    expect(res.body.folders.length).toBeGreaterThan(0);
    const first = res.body.folders[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('name');
  });

  it('passes parentId query param to getDriveFolders', async () => {
    await request(buildDriveApp(authService, exportService))
      .get('/v1/drive/folders?parentId=folder-001')
      .set('Authorization', 'Bearer token');

    expect(exportService.getDriveFolders).toHaveBeenCalledWith('ws-001', 'folder-001');
  });

  it('returns 503 when no Drive connection exists', async () => {
    const service = makeExportService({
      foldersResult: new Error('No Google Drive connection found. Please connect Drive first.'),
    });
    const res = await request(buildDriveApp(authService, service))
      .get('/v1/drive/folders')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(503);
  });

  it('returns 401 without JWT', async () => {
    authService.verifyJwt.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { statusCode: 401 }),
    );
    const res = await request(buildDriveApp(authService, exportService))
      .get('/v1/drive/folders');
    expect(res.status).toBe(401);
  });

  it('returns 500 on unexpected Drive error', async () => {
    const service = makeExportService({ foldersResult: new Error('Drive 500') });
    const res = await request(buildDriveApp(authService, service))
      .get('/v1/drive/folders')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(500);
  });

  it('viewer role can list folders', async () => {
    const auth = makeAuthService('viewer');
    const res = await request(buildDriveApp(auth, exportService))
      .get('/v1/drive/folders')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });
});
