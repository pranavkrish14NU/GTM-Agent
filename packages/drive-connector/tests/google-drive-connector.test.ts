/**
 * Unit tests for GoogleDriveConnector.
 *
 * All tests inject a MockDriveAPIClient — no network calls are made.
 *
 * Coverage:
 *   ✓ listFiles — returns mapped DriveFile array
 *   ✓ listFiles — sets trashed=false clause
 *   ✓ listFiles — appends folderId clause when provided
 *   ✓ listFiles — appends modifiedAfter clause when provided
 *   ✓ listFiles — filters by mimeTypes when provided
 *   ✓ listFiles — forwards pageToken and pageSize
 *   ✓ listFiles — forwards nextPageToken from API response
 *   ✓ listFiles — maps modifiedTime to Date
 *   ✓ listFiles — maps size string to number
 *   ✓ getFile — returns mapped DriveFile for known id
 *   ✓ getFile — propagates API error for unknown id
 *   ✓ getFileContent — exports Google Docs as text/plain
 *   ✓ getFileContent — exports Google Sheets as text/csv
 *   ✓ getFileContent — exports Google Slides as text/plain
 *   ✓ getFileContent — downloads text/* files directly
 *   ✓ getFileContent — returns binary placeholder for PDFs
 *   ✓ getFileContent — reports correct word count
 *   ✓ searchFiles — includes fullText query clause
 *   ✓ searchFiles — escapes single quotes in query
 *   ✓ searchFiles — appends folderId clause when provided
 *   ✓ searchFiles — respects maxResults cap
 *   ✓ getFilePermissions — returns mapped DrivePermission array
 *   ✓ getFilePermissions — propagates API error for unknown id
 *   ✓ getSyncStatus — returns idle status with connectionId google-drive
 *   ✓ createDriveConnector — returns GoogleDriveConnector for type google
 *   ✓ createDriveConnector — throws when accessToken is missing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GoogleDriveConnector } from '../src/google/google-drive-connector.js';
import { createDriveConnector } from '../src/factory.js';
import {
  MockDriveAPIClient,
  FIXTURE_DOC,
  FIXTURE_SHEET,
  FIXTURE_SLIDE,
  FIXTURE_PDF,
  FIXTURE_TXT,
  ALL_FIXTURE_FILES,
  FIXTURE_PERMISSIONS,
} from './fixtures/google-api-fixtures.js';

const WORKSPACE_ID = 'ws-real-001';

// ---------------------------------------------------------------------------
// Helper: build a connector backed by a fresh mock client
// ---------------------------------------------------------------------------

function makeConnector() {
  const client = new MockDriveAPIClient();
  const connector = new GoogleDriveConnector({ accessToken: 'test-token', client });
  return { connector, client };
}

// ---------------------------------------------------------------------------
// listFiles
// ---------------------------------------------------------------------------

describe('GoogleDriveConnector.listFiles', () => {
  it('returns a DriveFile array mapped from raw API response', async () => {
    const { connector } = makeConnector();
    const { files } = await connector.listFiles(WORKSPACE_ID);
    expect(files.length).toBe(ALL_FIXTURE_FILES.length);
    expect(files[0].id).toBe(FIXTURE_DOC.id);
    expect(files[0].name).toBe(FIXTURE_DOC.name);
  });

  it('always includes trashed=false in the query', async () => {
    const { connector, client } = makeConnector();
    await connector.listFiles(WORKSPACE_ID);
    expect(client.lastListFilesParams?.q).toContain('trashed = false');
  });

  it('appends folderId clause when folderId is provided', async () => {
    const { connector, client } = makeConnector();
    await connector.listFiles(WORKSPACE_ID, { folderId: 'folder-abc' });
    expect(client.lastListFilesParams?.q).toContain("'folder-abc' in parents");
  });

  it('appends modifiedAfter clause when modifiedAfter is provided', async () => {
    const { connector, client } = makeConnector();
    const since = new Date('2025-01-01T00:00:00Z');
    await connector.listFiles(WORKSPACE_ID, { modifiedAfter: since });
    expect(client.lastListFilesParams?.q).toContain(
      "modifiedTime > '2025-01-01T00:00:00.000Z'",
    );
  });

  it('filters by mimeTypes when provided', async () => {
    const { connector, client } = makeConnector();
    await connector.listFiles(WORKSPACE_ID, {
      mimeTypes: ['application/vnd.google-apps.document'],
    });
    expect(client.lastListFilesParams?.q).toContain(
      "mimeType = 'application/vnd.google-apps.document'",
    );
  });

  it('does NOT include mimeType clause when mimeTypes is empty array', async () => {
    const { connector, client } = makeConnector();
    await connector.listFiles(WORKSPACE_ID, { mimeTypes: [] });
    expect(client.lastListFilesParams?.q).not.toContain('mimeType');
  });

  it('forwards pageToken and pageSize to the API client', async () => {
    const { connector, client } = makeConnector();
    await connector.listFiles(WORKSPACE_ID, { pageToken: 'tok-abc', pageSize: 25 });
    expect(client.lastListFilesParams?.pageToken).toBe('tok-abc');
    expect(client.lastListFilesParams?.pageSize).toBe(25);
  });

  it('always passes orderBy: modifiedTime desc for consistent ordering', async () => {
    const { connector, client } = makeConnector();
    await connector.listFiles(WORKSPACE_ID);
    expect(client.lastListFilesParams?.orderBy).toBe('modifiedTime desc');
  });

  it('forwards nextPageToken from the API response', async () => {
    const { connector, client } = makeConnector();
    client.overrides.listFiles = async () => ({
      files: ALL_FIXTURE_FILES,
      nextPageToken: 'page2token',
    });
    const result = await connector.listFiles(WORKSPACE_ID);
    expect(result.nextPageToken).toBe('page2token');
  });

  it('maps modifiedTime string to a Date instance', async () => {
    const { connector } = makeConnector();
    const { files } = await connector.listFiles(WORKSPACE_ID);
    expect(files[0].modifiedAt).toBeInstanceOf(Date);
    // Both strings represent the same instant; Date.parse normalises them.
    expect(files[0].modifiedAt.getTime()).toBe(
      new Date(FIXTURE_DOC.modifiedTime).getTime(),
    );
  });

  it('maps size string to number when present', async () => {
    const { connector } = makeConnector();
    const { files } = await connector.listFiles(WORKSPACE_ID);
    const pdf = files.find((f) => f.id === FIXTURE_PDF.id)!;
    expect(pdf.size).toBe(204800);
  });

  it('leaves size undefined for Google-native files', async () => {
    const { connector } = makeConnector();
    const { files } = await connector.listFiles(WORKSPACE_ID);
    const doc = files.find((f) => f.id === FIXTURE_DOC.id)!;
    expect(doc.size).toBeUndefined();
  });

  it('returns empty files array and no nextPageToken when API returns nothing', async () => {
    const { connector, client } = makeConnector();
    client.overrides.listFiles = async () => ({ files: [] });
    const result = await connector.listFiles(WORKSPACE_ID);
    expect(result.files).toHaveLength(0);
    expect(result.nextPageToken).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getFile
// ---------------------------------------------------------------------------

describe('GoogleDriveConnector.getFile', () => {
  it('returns a mapped DriveFile for a known file id', async () => {
    const { connector } = makeConnector();
    const file = await connector.getFile(WORKSPACE_ID, FIXTURE_DOC.id);
    expect(file.id).toBe(FIXTURE_DOC.id);
    expect(file.name).toBe(FIXTURE_DOC.name);
    expect(file.modifiedAt).toBeInstanceOf(Date);
  });

  it('propagates the API error for an unknown file id', async () => {
    const { connector } = makeConnector();
    await expect(connector.getFile(WORKSPACE_ID, 'does-not-exist')).rejects.toThrow('404');
  });

  it('passes the fileId to the client', async () => {
    const { connector, client } = makeConnector();
    await connector.getFile(WORKSPACE_ID, FIXTURE_SHEET.id);
    expect(client.lastGetFileId).toBe(FIXTURE_SHEET.id);
  });
});

// ---------------------------------------------------------------------------
// getFileContent
// ---------------------------------------------------------------------------

describe('GoogleDriveConnector.getFileContent', () => {
  it('exports Google Docs as text/plain via exportFile', async () => {
    const { connector, client } = makeConnector();
    const exportSpy: string[] = [];
    client.overrides.exportFile = async (_id, mimeType) => {
      exportSpy.push(mimeType);
      return 'Exported doc text';
    };
    client.overrides.getFile = async () => FIXTURE_DOC;
    const result = await connector.getFileContent(WORKSPACE_ID, FIXTURE_DOC.id);
    expect(exportSpy).toContain('text/plain');
    expect(result.content).toBe('Exported doc text');
  });

  it('exports Google Sheets as text/csv via exportFile', async () => {
    const { connector, client } = makeConnector();
    const exportSpy: string[] = [];
    client.overrides.exportFile = async (_id, mimeType) => {
      exportSpy.push(mimeType);
      return 'col1,col2\nval1,val2';
    };
    client.overrides.getFile = async () => FIXTURE_SHEET;
    await connector.getFileContent(WORKSPACE_ID, FIXTURE_SHEET.id);
    expect(exportSpy).toContain('text/csv');
  });

  it('exports Google Slides as text/plain via exportFile', async () => {
    const { connector, client } = makeConnector();
    const exportSpy: string[] = [];
    client.overrides.exportFile = async (_id, mimeType) => {
      exportSpy.push(mimeType);
      return 'Slide text';
    };
    client.overrides.getFile = async () => FIXTURE_SLIDE;
    await connector.getFileContent(WORKSPACE_ID, FIXTURE_SLIDE.id);
    expect(exportSpy).toContain('text/plain');
  });

  it('downloads text/* files directly via downloadFile', async () => {
    const { connector, client } = makeConnector();
    let downloadCalled = false;
    client.overrides.downloadFile = async () => {
      downloadCalled = true;
      return 'Plain text file content here.';
    };
    client.overrides.getFile = async () => FIXTURE_TXT;
    const result = await connector.getFileContent(WORKSPACE_ID, FIXTURE_TXT.id);
    expect(downloadCalled).toBe(true);
    expect(result.content).toBe('Plain text file content here.');
  });

  it('returns a binary placeholder for PDF files', async () => {
    const { connector, client } = makeConnector();
    client.overrides.getFile = async () => FIXTURE_PDF;
    const result = await connector.getFileContent(WORKSPACE_ID, FIXTURE_PDF.id);
    expect(result.content).toContain('[BINARY CONTENT:');
    expect(result.content).toContain('application/pdf');
  });

  it('reports correct word count for text content', async () => {
    const { connector, client } = makeConnector();
    client.overrides.exportFile = async () => 'one two three four five';
    client.overrides.getFile = async () => FIXTURE_DOC;
    const result = await connector.getFileContent(WORKSPACE_ID, FIXTURE_DOC.id);
    expect(result.wordCount).toBe(5);
  });

  it('includes file name and mimeType in the result', async () => {
    const { connector, client } = makeConnector();
    client.overrides.exportFile = async () => 'content text';
    client.overrides.getFile = async () => FIXTURE_DOC;
    const result = await connector.getFileContent(WORKSPACE_ID, FIXTURE_DOC.id);
    expect(result.name).toBe(FIXTURE_DOC.name);
    expect(result.mimeType).toBe(FIXTURE_DOC.mimeType);
  });

  it('propagates API error for unknown file', async () => {
    const { connector } = makeConnector();
    await expect(
      connector.getFileContent(WORKSPACE_ID, 'nonexistent'),
    ).rejects.toThrow('404');
  });
});

// ---------------------------------------------------------------------------
// searchFiles
// ---------------------------------------------------------------------------

describe('GoogleDriveConnector.searchFiles', () => {
  it('includes fullText contains clause in the query', async () => {
    const { connector, client } = makeConnector();
    await connector.searchFiles(WORKSPACE_ID, { query: 'battlecard' });
    expect(client.lastListFilesParams?.q).toContain(
      "fullText contains 'battlecard'",
    );
  });

  it('escapes single quotes in the search query', async () => {
    const { connector, client } = makeConnector();
    await connector.searchFiles(WORKSPACE_ID, { query: "it's a test" });
    expect(client.lastListFilesParams?.q).toContain(
      "fullText contains 'it\\'s a test'",
    );
  });

  it('appends folderId clause when provided', async () => {
    const { connector, client } = makeConnector();
    await connector.searchFiles(WORKSPACE_ID, {
      query: 'forecast',
      folderId: 'folder-sales',
    });
    expect(client.lastListFilesParams?.q).toContain("'folder-sales' in parents");
  });

  it('passes maxResults as pageSize to the API client', async () => {
    const { connector, client } = makeConnector();
    await connector.searchFiles(WORKSPACE_ID, { query: 'test', maxResults: 5 });
    expect(client.lastListFilesParams?.pageSize).toBe(5);
  });

  it('defaults pageSize to 20 when maxResults is not set', async () => {
    const { connector, client } = makeConnector();
    await connector.searchFiles(WORKSPACE_ID, { query: 'test' });
    expect(client.lastListFilesParams?.pageSize).toBe(20);
  });

  it('returns mapped DriveFile array', async () => {
    const { connector, client } = makeConnector();
    client.overrides.listFiles = async () => ({ files: [FIXTURE_DOC, FIXTURE_SLIDE] });
    const results = await connector.searchFiles(WORKSPACE_ID, { query: 'gtm' });
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe(FIXTURE_DOC.id);
  });

  it('returns empty array when API returns no results', async () => {
    const { connector, client } = makeConnector();
    client.overrides.listFiles = async () => ({ files: [] });
    const results = await connector.searchFiles(WORKSPACE_ID, { query: 'zzz-no-match' });
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getFilePermissions
// ---------------------------------------------------------------------------

describe('GoogleDriveConnector.getFilePermissions', () => {
  it('returns mapped DrivePermission array', async () => {
    const { connector } = makeConnector();
    const perms = await connector.getFilePermissions(WORKSPACE_ID, FIXTURE_DOC.id);
    expect(perms.length).toBe(FIXTURE_PERMISSIONS.length);
    expect(perms[0].id).toBe(FIXTURE_PERMISSIONS[0].id);
    expect(perms[0].role).toBe('owner');
  });

  it('includes emailAddress when present', async () => {
    const { connector } = makeConnector();
    const perms = await connector.getFilePermissions(WORKSPACE_ID, FIXTURE_DOC.id);
    const owner = perms.find((p) => p.role === 'owner')!;
    expect(owner.emailAddress).toBe('owner@example.com');
  });

  it('maps domain permission type correctly', async () => {
    const { connector } = makeConnector();
    const perms = await connector.getFilePermissions(WORKSPACE_ID, FIXTURE_DOC.id);
    const domain = perms.find((p) => p.type === 'domain')!;
    expect(domain.role).toBe('reader');
  });

  it('does not include isMock on real connector results', async () => {
    const { connector } = makeConnector();
    const perms = await connector.getFilePermissions(WORKSPACE_ID, FIXTURE_DOC.id);
    expect(perms.every((p) => p.isMock === undefined)).toBe(true);
  });

  it('propagates API error for unknown file', async () => {
    const { connector } = makeConnector();
    await expect(
      connector.getFilePermissions(WORKSPACE_ID, 'bad-id'),
    ).rejects.toThrow('404');
  });
});

// ---------------------------------------------------------------------------
// getSyncStatus
// ---------------------------------------------------------------------------

describe('GoogleDriveConnector.getSyncStatus', () => {
  it("returns status 'idle'", async () => {
    const { connector } = makeConnector();
    const status = await connector.getSyncStatus(WORKSPACE_ID);
    expect(status.status).toBe('idle');
  });

  it("sets connectionId to 'google-drive'", async () => {
    const { connector } = makeConnector();
    const status = await connector.getSyncStatus(WORKSPACE_ID);
    expect(status.connectionId).toBe('google-drive');
  });

  it('lastSyncAt is a Date', async () => {
    const { connector } = makeConnector();
    const status = await connector.getSyncStatus(WORKSPACE_ID);
    expect(status.lastSyncAt).toBeInstanceOf(Date);
  });

  it('does not include isMock', async () => {
    const { connector } = makeConnector();
    const status = await connector.getSyncStatus(WORKSPACE_ID);
    expect(status.isMock).toBeUndefined();
  });

  it('passes trashed=false in the status query', async () => {
    const { connector, client } = makeConnector();
    await connector.getSyncStatus(WORKSPACE_ID);
    expect(client.lastListFilesParams?.q).toContain('trashed = false');
  });
});

// ---------------------------------------------------------------------------
// createDriveConnector factory — google type
// ---------------------------------------------------------------------------

describe("createDriveConnector — type 'google'", () => {
  it('returns a GoogleDriveConnector when type is google', () => {
    const connector = createDriveConnector({
      type: 'google',
      googleOptions: { accessToken: 'test-tok' },
    });
    expect(connector).toBeInstanceOf(GoogleDriveConnector);
  });

  it('throws when type is google and no accessToken is supplied', () => {
    expect(() =>
      createDriveConnector({
        type: 'google',
        googleOptions: { accessToken: '' },
      }),
    ).toThrow(/accessToken/i);
  });

  it('reads GOOGLE_ACCESS_TOKEN env var when googleOptions is not set', () => {
    const original = process.env['GOOGLE_ACCESS_TOKEN'];
    process.env['GOOGLE_ACCESS_TOKEN'] = 'env-token';
    const connector = createDriveConnector({ type: 'google' });
    expect(connector).toBeInstanceOf(GoogleDriveConnector);
    if (original === undefined) {
      delete process.env['GOOGLE_ACCESS_TOKEN'];
    } else {
      process.env['GOOGLE_ACCESS_TOKEN'] = original;
    }
  });

  it('still throws for unknown connector type', () => {
    expect(() =>
      createDriveConnector({ type: 'sharepoint' as 'mock' }),
    ).toThrow(/unknown/i);
  });
});
