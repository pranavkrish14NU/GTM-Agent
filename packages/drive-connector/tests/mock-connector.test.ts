/**
 * Unit tests for MockDriveConnector and createDriveConnector factory.
 *
 * Coverage:
 *   ✓ listFiles — returns all 23 mock files
 *   ✓ listFiles — filters by folder
 *   ✓ listFiles — filters by MIME type
 *   ✓ listFiles — paginates with pageToken / nextPageToken
 *   ✓ getFile — returns matching DriveFile metadata
 *   ✓ getFile — throws for unknown fileId
 *   ✓ getFileContent — returns content with isMock: true
 *   ✓ getFileContent — content starts with [MOCK] prefix
 *   ✓ getFileContent — reports correct word count
 *   ✓ getFileContent — throws for unknown fileId
 *   ✓ searchFiles — finds files by name substring
 *   ✓ searchFiles — finds files by content keyword
 *   ✓ searchFiles — respects maxResults cap
 *   ✓ searchFiles — returns empty array for unmatched query
 *   ✓ getFilePermissions — returns at least owner + domain permissions
 *   ✓ getFilePermissions — throws for unknown fileId
 *   ✓ getSyncStatus — returns idle status with filesScanned == total file count
 *   ✓ All responses have isMock: true
 *   ✓ MockDriveConnector with latency — adds observable delay
 *   ✓ createDriveConnector — returns MockDriveConnector for type 'mock'
 *   ✓ createDriveConnector — throws for type 'google' (not yet implemented)
 *   ✓ createDriveConnector — throws for unknown type
 *   ✓ Mock data — 23+ files across expected categories
 */

import { describe, it, expect, vi } from 'vitest';
import { MockDriveConnector } from '../src/mock/mock-connector.js';
import { createDriveConnector } from '../src/factory.js';

const WORKSPACE_ID = 'test-ws-001';

// ---------------------------------------------------------------------------
// listFiles
// ---------------------------------------------------------------------------

describe('MockDriveConnector.listFiles', () => {
  it('returns all mock files when no options given', async () => {
    const connector = new MockDriveConnector();
    const { files } = await connector.listFiles(WORKSPACE_ID);
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  it('all returned files have isMock: true', async () => {
    const connector = new MockDriveConnector();
    const { files } = await connector.listFiles(WORKSPACE_ID);
    expect(files.every((f) => f.isMock === true)).toBe(true);
  });

  it('all returned files have modifiedAt as a Date', async () => {
    const connector = new MockDriveConnector();
    const { files } = await connector.listFiles(WORKSPACE_ID);
    expect(files.every((f) => f.modifiedAt instanceof Date)).toBe(true);
  });

  it('filters by folderId', async () => {
    const connector = new MockDriveConnector();
    const { files } = await connector.listFiles(WORKSPACE_ID, { folderId: 'mock-folder-brand' });
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(files.every((f) => f.parents?.includes('mock-folder-brand'))).toBe(true);
  });

  it('filters by mimeType', async () => {
    const connector = new MockDriveConnector();
    const { files } = await connector.listFiles(WORKSPACE_ID, {
      mimeTypes: ['application/vnd.google-apps.presentation'],
    });
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(files.every((f) => f.mimeType === 'application/vnd.google-apps.presentation')).toBe(true);
  });

  it('paginates with pageSize and returns nextPageToken', async () => {
    const connector = new MockDriveConnector();
    const page1 = await connector.listFiles(WORKSPACE_ID, { pageSize: 5 });
    expect(page1.files).toHaveLength(5);
    expect(page1.nextPageToken).toBeDefined();
  });

  it('returns second page using nextPageToken', async () => {
    const connector = new MockDriveConnector();
    const page1 = await connector.listFiles(WORKSPACE_ID, { pageSize: 5 });
    const page2 = await connector.listFiles(WORKSPACE_ID, {
      pageSize: 5,
      pageToken: page1.nextPageToken,
    });
    expect(page2.files.length).toBeGreaterThan(0);
    // Pages must not overlap.
    const ids1 = new Set(page1.files.map((f) => f.id));
    const ids2 = page2.files.map((f) => f.id);
    expect(ids2.every((id) => !ids1.has(id))).toBe(true);
  });

  it('returns no nextPageToken when all files fit in one page', async () => {
    const connector = new MockDriveConnector();
    const { nextPageToken } = await connector.listFiles(WORKSPACE_ID, { pageSize: 100 });
    expect(nextPageToken).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getFile
// ---------------------------------------------------------------------------

describe('MockDriveConnector.getFile', () => {
  it('returns file metadata for a known file', async () => {
    const connector = new MockDriveConnector();
    const file = await connector.getFile(WORKSPACE_ID, 'mock-file-001');
    expect(file.id).toBe('mock-file-001');
    expect(file.isMock).toBe(true);
    expect(file.modifiedAt).toBeInstanceOf(Date);
  });

  it('throws for an unknown fileId', async () => {
    const connector = new MockDriveConnector();
    await expect(connector.getFile(WORKSPACE_ID, 'nonexistent-id')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getFileContent
// ---------------------------------------------------------------------------

describe('MockDriveConnector.getFileContent', () => {
  it('returns content with isMock: true', async () => {
    const connector = new MockDriveConnector();
    const content = await connector.getFileContent(WORKSPACE_ID, 'mock-file-001');
    expect(content.isMock).toBe(true);
  });

  it('content starts with [MOCK] prefix', async () => {
    const connector = new MockDriveConnector();
    const content = await connector.getFileContent(WORKSPACE_ID, 'mock-file-005');
    expect(content.content).toMatch(/^\[MOCK\]/);
  });

  it('reports positive word count', async () => {
    const connector = new MockDriveConnector();
    const content = await connector.getFileContent(WORKSPACE_ID, 'mock-file-010');
    expect(content.wordCount).toBeGreaterThan(50);
  });

  it('includes file name and mimeType', async () => {
    const connector = new MockDriveConnector();
    const content = await connector.getFileContent(WORKSPACE_ID, 'mock-file-001');
    expect(typeof content.name).toBe('string');
    expect(content.name.length).toBeGreaterThan(0);
    expect(typeof content.mimeType).toBe('string');
  });

  it('throws for unknown fileId', async () => {
    const connector = new MockDriveConnector();
    await expect(connector.getFileContent(WORKSPACE_ID, 'bad-id')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// searchFiles
// ---------------------------------------------------------------------------

describe('MockDriveConnector.searchFiles', () => {
  it('finds files by name keyword', async () => {
    const connector = new MockDriveConnector();
    const results = await connector.searchFiles(WORKSPACE_ID, { query: 'battlecard' });
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  it('finds files by content keyword', async () => {
    const connector = new MockDriveConnector();
    const results = await connector.searchFiles(WORKSPACE_ID, { query: 'MEDDIC' });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('is case-insensitive', async () => {
    const connector = new MockDriveConnector();
    const lower = await connector.searchFiles(WORKSPACE_ID, { query: 'battlecard' });
    const upper = await connector.searchFiles(WORKSPACE_ID, { query: 'BATTLECARD' });
    expect(lower.length).toBe(upper.length);
  });

  it('respects maxResults cap', async () => {
    const connector = new MockDriveConnector();
    const results = await connector.searchFiles(WORKSPACE_ID, { query: 'mock', maxResults: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('returns empty array for no matches', async () => {
    const connector = new MockDriveConnector();
    const results = await connector.searchFiles(WORKSPACE_ID, {
      query: 'zzz-no-match-xyz-123456',
    });
    expect(results).toHaveLength(0);
  });

  it('all results have isMock: true', async () => {
    const connector = new MockDriveConnector();
    const results = await connector.searchFiles(WORKSPACE_ID, { query: 'persona' });
    expect(results.every((f) => f.isMock === true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getFilePermissions
// ---------------------------------------------------------------------------

describe('MockDriveConnector.getFilePermissions', () => {
  it('returns at least two permissions (owner + domain)', async () => {
    const connector = new MockDriveConnector();
    const perms = await connector.getFilePermissions(WORKSPACE_ID, 'mock-file-001');
    expect(perms.length).toBeGreaterThanOrEqual(2);
  });

  it('includes an owner permission', async () => {
    const connector = new MockDriveConnector();
    const perms = await connector.getFilePermissions(WORKSPACE_ID, 'mock-file-001');
    expect(perms.some((p) => p.role === 'owner')).toBe(true);
  });

  it('all permissions have isMock: true', async () => {
    const connector = new MockDriveConnector();
    const perms = await connector.getFilePermissions(WORKSPACE_ID, 'mock-file-001');
    expect(perms.every((p) => p.isMock === true)).toBe(true);
  });

  it('throws for unknown fileId', async () => {
    const connector = new MockDriveConnector();
    await expect(connector.getFilePermissions(WORKSPACE_ID, 'bad-id')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getSyncStatus
// ---------------------------------------------------------------------------

describe('MockDriveConnector.getSyncStatus', () => {
  it('returns idle status', async () => {
    const connector = new MockDriveConnector();
    const status = await connector.getSyncStatus(WORKSPACE_ID);
    expect(status.status).toBe('idle');
  });

  it('filesScanned matches total number of mock files', async () => {
    const connector = new MockDriveConnector();
    const { files } = await connector.listFiles(WORKSPACE_ID, { pageSize: 1000 });
    const status = await connector.getSyncStatus(WORKSPACE_ID);
    expect(status.filesScanned).toBe(files.length);
  });

  it('lastSyncAt is a Date in the past', async () => {
    const connector = new MockDriveConnector();
    const status = await connector.getSyncStatus(WORKSPACE_ID);
    expect(status.lastSyncAt).toBeInstanceOf(Date);
    expect(status.lastSyncAt!.getTime()).toBeLessThan(Date.now());
  });

  it('isMock is true', async () => {
    const connector = new MockDriveConnector();
    const status = await connector.getSyncStatus(WORKSPACE_ID);
    expect(status.isMock).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Simulated latency
// ---------------------------------------------------------------------------

describe('MockDriveConnector latency option', () => {
  it('adds observable delay when latencyMs is set', async () => {
    const connector = new MockDriveConnector({ latencyMs: 50 });
    const start = Date.now();
    await connector.listFiles(WORKSPACE_ID);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40); // allow small timer jitter
  });
});

// ---------------------------------------------------------------------------
// Mock data coverage
// ---------------------------------------------------------------------------

describe('Mock data coverage', () => {
  it('has at least 20 files in the fixture', async () => {
    const connector = new MockDriveConnector();
    const { files } = await connector.listFiles(WORKSPACE_ID, { pageSize: 1000 });
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  it('includes brand category files', async () => {
    const connector = new MockDriveConnector();
    const { files } = await connector.listFiles(WORKSPACE_ID, {
      folderId: 'mock-folder-brand',
      pageSize: 1000,
    });
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it('includes competitive intelligence files', async () => {
    const connector = new MockDriveConnector();
    const { files } = await connector.listFiles(WORKSPACE_ID, {
      folderId: 'mock-folder-competitive',
      pageSize: 1000,
    });
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it('includes buyer persona files', async () => {
    const connector = new MockDriveConnector();
    const { files } = await connector.listFiles(WORKSPACE_ID, {
      folderId: 'mock-folder-personas',
      pageSize: 1000,
    });
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it('includes campaign brief files', async () => {
    const connector = new MockDriveConnector();
    const { files } = await connector.listFiles(WORKSPACE_ID, {
      folderId: 'mock-folder-campaigns',
      pageSize: 1000,
    });
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it('includes win/loss report files', async () => {
    const connector = new MockDriveConnector();
    const { files } = await connector.listFiles(WORKSPACE_ID, {
      folderId: 'mock-folder-winloss',
      pageSize: 1000,
    });
    expect(files.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// createDriveConnector factory
// ---------------------------------------------------------------------------

describe('createDriveConnector', () => {
  it("returns MockDriveConnector for type 'mock'", () => {
    const connector = createDriveConnector({ type: 'mock' });
    expect(connector).toBeInstanceOf(MockDriveConnector);
  });

  it("throws for type 'google' (not yet implemented)", () => {
    expect(() => createDriveConnector({ type: 'google' })).toThrow(/not yet implemented/i);
  });

  it('throws for unknown type', () => {
    expect(() =>
      createDriveConnector({ type: 'sharepoint' as 'mock' }),
    ).toThrow(/unknown/i);
  });

  it('reads DRIVE_CONNECTOR env var when no type option given', () => {
    const original = process.env['DRIVE_CONNECTOR'];
    process.env['DRIVE_CONNECTOR'] = 'mock';
    const connector = createDriveConnector();
    expect(connector).toBeInstanceOf(MockDriveConnector);
    if (original === undefined) {
      delete process.env['DRIVE_CONNECTOR'];
    } else {
      process.env['DRIVE_CONNECTOR'] = original;
    }
  });

  it("defaults to mock when DRIVE_CONNECTOR is not set", () => {
    const original = process.env['DRIVE_CONNECTOR'];
    delete process.env['DRIVE_CONNECTOR'];
    const connector = createDriveConnector();
    expect(connector).toBeInstanceOf(MockDriveConnector);
    if (original !== undefined) {
      process.env['DRIVE_CONNECTOR'] = original;
    }
  });
});
