/**
 * Unit tests for ExportService and pure export functions.
 *
 * Covers:
 *   - buildGoogleDocHtml: metadata embedding, HTML structure, escaping
 *   - buildExportFilename: format-based extension, date formatting
 *   - ExportService.exportDraft: happy path, missing draft, missing token, Drive error
 *   - ExportService.getExportStatus: found/not found
 *   - ExportService.getDriveFolders: happy path, no connection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildGoogleDocHtml,
  buildExportFilename,
  ExportService,
} from '../src/services/export.service.js';
import {
  makeMockPool,
  makeMockTokenProvider,
  makeMockDriveClient,
  FIXTURE_DRAFT_ROW_FOR_EXPORT,
  FIXTURE_DRAFT_ROW_NO_EXPORT,
  FIXTURE_DRIVE_FILE,
  FIXTURE_DRIVE_FOLDERS,
} from './fixtures/export.js';

// ---------------------------------------------------------------------------
// buildGoogleDocHtml
// ---------------------------------------------------------------------------

describe('buildGoogleDocHtml', () => {
  const generatedAt = new Date('2026-05-24T08:00:00Z').toISOString();

  it('includes topic as h1 heading', () => {
    const html = buildGoogleDocHtml('Some generated content here.', 'AI in Sales', 'blog_post', 'Alex', generatedAt);
    expect(html).toContain('<h1>AI in Sales</h1>');
  });

  it('includes metadata with generated date, module, type, and author', () => {
    const html = buildGoogleDocHtml('Some generated content here.', 'AI in Sales', 'blog_post', 'Alex', generatedAt);
    expect(html).toContain('Content Studio');
    expect(html).toContain('blog post');
    expect(html).toContain('Alex');
    expect(html).toContain('2026'); // year in formatted date
  });

  it('wraps paragraphs in <p> tags', () => {
    const text = 'First paragraph.\n\nSecond paragraph.';
    const html = buildGoogleDocHtml(text, 'Blog', 'blog_post', 'Alice', generatedAt);
    expect(html).toContain('<p>First paragraph.</p>');
    expect(html).toContain('<p>Second paragraph.</p>');
  });

  it('escapes HTML special characters in topic', () => {
    const html = buildGoogleDocHtml('Some text', 'AI & ML <Sales>', 'blog_post', 'Bob', generatedAt);
    expect(html).toContain('AI &amp; ML &lt;Sales&gt;');
    expect(html).not.toContain('<Sales>');
  });

  it('escapes HTML in generated text', () => {
    const text = 'Use <bold> and & to format.';
    const html = buildGoogleDocHtml(text, 'Topic', 'blog_post', 'Bob', generatedAt);
    expect(html).toContain('&lt;bold&gt;');
    expect(html).toContain('&amp;');
  });

  it('handles empty generated text gracefully', () => {
    const html = buildGoogleDocHtml('', 'Topic', 'blog_post', 'Bob', generatedAt);
    expect(html).toContain('(No content)');
  });

  it('includes horizontal rule separator', () => {
    const html = buildGoogleDocHtml('text', 'Topic', 'blog_post', 'Bob', generatedAt);
    expect(html).toContain('<hr>');
  });

  it('preserves internal line breaks within a paragraph', () => {
    const text = 'Line one\nLine two';
    const html = buildGoogleDocHtml(text, 'Topic', 'blog_post', 'Bob', generatedAt);
    expect(html).toContain('<br>');
  });
});

// ---------------------------------------------------------------------------
// buildExportFilename
// ---------------------------------------------------------------------------

describe('buildExportFilename', () => {
  const generatedAt = new Date('2026-05-24T08:00:00Z').toISOString();

  it('uses .gdoc extension for gdoc format', () => {
    const name = buildExportFilename('AI in Sales', 'blog_post', 'gdoc', generatedAt);
    expect(name).toMatch(/\.gdoc$/);
  });

  it('uses .pdf extension for pdf format', () => {
    const name = buildExportFilename('AI in Sales', 'blog_post', 'pdf', generatedAt);
    expect(name).toMatch(/\.pdf$/);
  });

  it('includes date in filename', () => {
    const name = buildExportFilename('AI in Sales', 'blog_post', 'gdoc', generatedAt);
    expect(name).toContain('2026-05-24');
  });

  it('includes topic in filename', () => {
    const name = buildExportFilename('My Topic', 'email', 'gdoc', generatedAt);
    expect(name).toContain('My Topic');
  });

  it('strips special characters from topic', () => {
    const name = buildExportFilename('AI & ML!', 'email', 'gdoc', generatedAt);
    expect(name).not.toContain('&');
    expect(name).not.toContain('!');
  });

  it('truncates very long topic names', () => {
    const longTopic = 'A'.repeat(100);
    const name = buildExportFilename(longTopic, 'blog_post', 'gdoc', generatedAt);
    expect(name.length).toBeLessThan(150);
  });
});

// ---------------------------------------------------------------------------
// ExportService.exportDraft
// ---------------------------------------------------------------------------

describe('ExportService.exportDraft', () => {
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = vi.fn();
  });

  it('returns ExportResult on happy path', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_DRAFT_ROW_NO_EXPORT], rowCount: 1 }) // _loadDraft
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // pending UPDATE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // completed UPDATE

    const tokenProvider = makeMockTokenProvider();
    const driveClient = makeMockDriveClient();
    const service = new ExportService(makeMockPool({ query: mockQuery }), tokenProvider, driveClient);

    const result = await service.exportDraft('ws-001', 'user-001', 'draft-001', 'folder-001', 'gdoc');

    expect(result.status).toBe('completed');
    expect(result.fileId).toBe(FIXTURE_DRIVE_FILE.id);
    expect(result.webViewLink).toBe(FIXTURE_DRIVE_FILE.webViewLink);
    expect(result.format).toBe('gdoc');
    expect(result.exportId).toBeTruthy();
    expect(result.exportedAt).toBeTruthy();
  });

  it('calls driveClient.createFile with correct params', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_DRAFT_ROW_NO_EXPORT], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const driveClient = makeMockDriveClient();
    const service = new ExportService(
      makeMockPool({ query: mockQuery }),
      makeMockTokenProvider(),
      driveClient,
    );

    await service.exportDraft('ws-001', 'user-001', 'draft-001', 'folder-002', 'gdoc');

    expect(driveClient.createFile).toHaveBeenCalledOnce();
    const params = (driveClient.createFile as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      name: string;
      mimeType: string;
      folderId: string;
      content: string;
    };
    expect(params.folderId).toBe('folder-002');
    expect(params.mimeType).toBe('application/vnd.google-apps.document');
    expect(params.content).toContain('<h1>');
    expect(params.name).toMatch(/\.gdoc$/);
  });

  it('embeds metadata in the created document HTML', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_DRAFT_ROW_NO_EXPORT], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const driveClient = makeMockDriveClient();
    const service = new ExportService(
      makeMockPool({ query: mockQuery }),
      makeMockTokenProvider(),
      driveClient,
    );

    await service.exportDraft('ws-001', 'user-001', 'draft-001', undefined, 'gdoc');

    const params = (driveClient.createFile as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      content: string;
    };
    expect(params.content).toContain('Content Studio'); // source module
    expect(params.content).toContain('2026'); // generated date
  });

  it('throws and writes failed status when draft not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // not found

    const service = new ExportService(
      makeMockPool({ query: mockQuery }),
      makeMockTokenProvider(),
      makeMockDriveClient(),
    );

    await expect(
      service.exportDraft('ws-001', 'user-001', 'missing', undefined, 'gdoc'),
    ).rejects.toThrow('not found');
  });

  it('throws when no Drive connection exists', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [FIXTURE_DRAFT_ROW_NO_EXPORT], rowCount: 1 });

    const service = new ExportService(
      makeMockPool({ query: mockQuery }),
      makeMockTokenProvider({ token: null }),
      makeMockDriveClient(),
    );

    await expect(
      service.exportDraft('ws-001', 'user-001', 'draft-001', undefined, 'gdoc'),
    ).rejects.toThrow('No Google Drive connection');
  });

  it('writes failed status when Drive API throws', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_DRAFT_ROW_NO_EXPORT], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // pending UPDATE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // failed UPDATE

    const driveClient = makeMockDriveClient({ fileResult: new Error('Drive API 500') });
    const service = new ExportService(
      makeMockPool({ query: mockQuery }),
      makeMockTokenProvider(),
      driveClient,
    );

    await expect(
      service.exportDraft('ws-001', 'user-001', 'draft-001', undefined, 'gdoc'),
    ).rejects.toThrow('Drive API 500');

    // Verify failed status was written
    const updateCalls = mockQuery.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE'),
    );
    const lastUpdate = updateCalls[updateCalls.length - 1];
    const payload = JSON.parse(lastUpdate![1][0] as string) as {
      last_export: { status: string; errorMessage: string };
    };
    expect(payload.last_export.status).toBe('failed');
    expect(payload.last_export.errorMessage).toContain('Drive API 500');
  });

  it('stores pending then completed status in order', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [FIXTURE_DRAFT_ROW_NO_EXPORT], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const service = new ExportService(
      makeMockPool({ query: mockQuery }),
      makeMockTokenProvider(),
      makeMockDriveClient(),
    );

    await service.exportDraft('ws-001', 'user-001', 'draft-001', undefined, 'gdoc');

    const updateCalls = mockQuery.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('UPDATE'),
    );
    expect(updateCalls.length).toBe(2);

    const firstPayload = JSON.parse(updateCalls[0]![1][0] as string) as {
      last_export: { status: string };
    };
    const secondPayload = JSON.parse(updateCalls[1]![1][0] as string) as {
      last_export: { status: string };
    };
    expect(firstPayload.last_export.status).toBe('pending');
    expect(secondPayload.last_export.status).toBe('completed');
  });
});

// ---------------------------------------------------------------------------
// ExportService.getExportStatus
// ---------------------------------------------------------------------------

describe('ExportService.getExportStatus', () => {
  it('returns null when draft not found', async () => {
    const service = new ExportService(makeMockPool(), makeMockTokenProvider(), makeMockDriveClient());
    const result = await service.getExportStatus('ws-001', 'missing');
    expect(result).toBeNull();
  });

  it('returns null when draft has no export record', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [FIXTURE_DRAFT_ROW_NO_EXPORT],
      rowCount: 1,
    });
    const service = new ExportService(makeMockPool({ query: mockQuery }), makeMockTokenProvider(), makeMockDriveClient());
    const result = await service.getExportStatus('ws-001', 'draft-001');
    expect(result).toBeNull();
  });

  it('returns ExportRecord when export exists', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [FIXTURE_DRAFT_ROW_FOR_EXPORT],
      rowCount: 1,
    });
    const service = new ExportService(makeMockPool({ query: mockQuery }), makeMockTokenProvider(), makeMockDriveClient());
    const result = await service.getExportStatus('ws-001', 'draft-001');
    expect(result).not.toBeNull();
    expect(result!.status).toBe('completed');
    expect(result!.fileId).toBe(FIXTURE_DRIVE_FILE.id);
  });
});

// ---------------------------------------------------------------------------
// ExportService.getDriveFolders
// ---------------------------------------------------------------------------

describe('ExportService.getDriveFolders', () => {
  it('returns folder list from Drive', async () => {
    const service = new ExportService(
      makeMockPool(),
      makeMockTokenProvider(),
      makeMockDriveClient(),
    );
    const folders = await service.getDriveFolders('ws-001');
    expect(folders).toHaveLength(FIXTURE_DRIVE_FOLDERS.length);
    expect(folders[0]).toHaveProperty('id');
    expect(folders[0]).toHaveProperty('name');
  });

  it('throws when no Drive connection exists', async () => {
    const service = new ExportService(
      makeMockPool(),
      makeMockTokenProvider({ token: null }),
      makeMockDriveClient(),
    );
    await expect(service.getDriveFolders('ws-001')).rejects.toThrow('No Google Drive connection');
  });

  it('passes parentId to driveClient.listFolders', async () => {
    const driveClient = makeMockDriveClient();
    const service = new ExportService(makeMockPool(), makeMockTokenProvider(), driveClient);
    await service.getDriveFolders('ws-001', 'folder-001');
    expect(driveClient.listFolders).toHaveBeenCalledWith('mock-access-token', 'folder-001');
  });

  it('propagates Drive API errors', async () => {
    const service = new ExportService(
      makeMockPool(),
      makeMockTokenProvider(),
      makeMockDriveClient({ foldersResult: new Error('Drive 403') }),
    );
    await expect(service.getDriveFolders('ws-001')).rejects.toThrow('Drive 403');
  });
});
