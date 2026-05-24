/**
 * Test fixtures for ExportService and export/drive route tests.
 */

import { vi } from 'vitest';
import type {
  DriveApiClient,
  DriveTokenProvider,
  DriveFile,
  DriveFolder,
  ExportRecord,
  ExportResult,
} from '../../src/services/export.service.js';

// ---------------------------------------------------------------------------
// Mock pool factory
// ---------------------------------------------------------------------------

export function makeMockPool(overrides?: { query?: ReturnType<typeof vi.fn> }) {
  return {
    query: overrides?.query ?? vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  } as unknown as import('pg').Pool;
}

// ---------------------------------------------------------------------------
// Mock token provider
// ---------------------------------------------------------------------------

export function makeMockTokenProvider(options?: {
  token?: string | null;
  throwOn?: Error;
}): DriveTokenProvider {
  return {
    getAccessToken: vi.fn().mockImplementation(async () => {
      if (options?.throwOn) throw options.throwOn;
      return options?.token !== undefined ? options.token : 'mock-access-token';
    }),
  };
}

// ---------------------------------------------------------------------------
// Mock Drive API client
// ---------------------------------------------------------------------------

export function makeMockDriveClient(options?: {
  fileResult?: DriveFile | Error;
  foldersResult?: DriveFolder[] | Error;
}): DriveApiClient {
  return {
    createFile: vi.fn().mockImplementation(async () => {
      const r = options?.fileResult;
      if (r instanceof Error) throw r;
      return r ?? FIXTURE_DRIVE_FILE;
    }),
    listFolders: vi.fn().mockImplementation(async () => {
      const r = options?.foldersResult;
      if (r instanceof Error) throw r;
      return r ?? FIXTURE_DRIVE_FOLDERS;
    }),
  };
}

// ---------------------------------------------------------------------------
// Drive file fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_DRIVE_FILE: DriveFile = {
  id: 'drive-file-001',
  name: 'AI in Sales — blog_post — 2026-05-24.gdoc',
  webViewLink: 'https://docs.google.com/document/d/drive-file-001/edit',
  mimeType: 'application/vnd.google-apps.document',
};

export const FIXTURE_DRIVE_FOLDERS: DriveFolder[] = [
  { id: 'folder-001', name: 'BOBA Content', parentId: null },
  { id: 'folder-002', name: 'Blog Posts', parentId: 'folder-001' },
  { id: 'folder-003', name: 'Email Templates', parentId: 'folder-001' },
];

// ---------------------------------------------------------------------------
// Export record / result fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_EXPORT_RECORD_COMPLETED: ExportRecord = {
  exportId: 'export-001',
  status: 'completed',
  format: 'gdoc',
  folderId: 'folder-001',
  fileId: FIXTURE_DRIVE_FILE.id,
  webViewLink: FIXTURE_DRIVE_FILE.webViewLink,
  exportedAt: new Date('2026-05-24T10:00:00Z').toISOString(),
  errorMessage: null,
};

export const FIXTURE_EXPORT_RESULT: ExportResult = {
  exportId: 'export-001',
  status: 'completed',
  fileId: FIXTURE_DRIVE_FILE.id,
  webViewLink: FIXTURE_DRIVE_FILE.webViewLink,
  format: 'gdoc',
  exportedAt: new Date('2026-05-24T10:00:00Z').toISOString(),
};

// ---------------------------------------------------------------------------
// Draft DB row fixture (content_draft with last_export)
// ---------------------------------------------------------------------------

export const FIXTURE_DRAFT_ROW_FOR_EXPORT = {
  id: 'draft-001',
  payload: {
    user_id: 'user-001',
    type: 'blog_post',
    topic: 'AI in Sales Enablement',
    tone: 'formal',
    length: 'medium',
    channel: 'company-blog',
    target_persona: 'VP of Marketing',
    generated_text:
      'Leverage our enterprise platform to optimize your strategic outcomes.\n\n' +
      'Our robust solution facilitates seamless implementation across your organization.',
    brand_voice_score: 78,
    persona_fit_score: 65,
    source_references: [],
    word_count: 24,
    updated_at: new Date('2026-05-24T08:00:00Z').toISOString(),
    last_export: FIXTURE_EXPORT_RECORD_COMPLETED,
  },
  created_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};

export const FIXTURE_DRAFT_ROW_NO_EXPORT = {
  ...FIXTURE_DRAFT_ROW_FOR_EXPORT,
  payload: {
    ...FIXTURE_DRAFT_ROW_FOR_EXPORT.payload,
    last_export: undefined,
  },
};
