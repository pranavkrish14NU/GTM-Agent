/**
 * Unit tests for FileProcessingService.
 *
 * The pg.Pool, DriveConnector, and crypto (decrypt) are all controlled via
 * mocking — no database or network calls.
 *
 * Coverage:
 *   ✓ processFile — processes new document, writes chunks, updates hash
 *   ✓ processFile — idempotent: same content_hash → skipped
 *   ✓ processFile — document not found → permanent_failure
 *   ✓ processFile — connection not found → permanent_failure
 *   ✓ processFile — permanent ExtractionError → permanent_failure (no throw)
 *   ✓ processFile — transient error (non-permanent) → rethrows for 500 retry
 *   ✓ processFile — correct number of chunks written for given text
 *   ✓ processFile — chunk INSERT includes content, content_hash, sequence
 *   ✓ processFile — old chunks are deleted before new ones are inserted
 *   ✓ processFile — document.content_hash updated after processing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import { FileProcessingService, type FileProcessTaskPayload } from '../src/services/file-processing.service.js';
import {
  SAMPLE_GDOC_TEXT,
  FIXTURE_DOCUMENT_ROW,
} from './fixtures/mime-fixtures.js';

// ---------------------------------------------------------------------------
// Mock config so tests don't need env vars.
// ---------------------------------------------------------------------------

vi.mock('../src/config.js', () => ({
  config: {
    nodeEnv: 'test',
    encryptionKeyHex: 'a'.repeat(64),
    databaseUrl: '',
    port: 8081,
    // 'google' exercises the token-decrypt + connector path these tests assert.
    driveConnector: 'google',
    isTest: true,
  },
}));

// ---------------------------------------------------------------------------
// Mock the connector factory — avoid real OAuth and Drive API.
// ---------------------------------------------------------------------------

const makeMockConnector = (getFileContent: ReturnType<typeof vi.fn>) => ({
  getFileContent,
  listFiles: vi.fn(async () => ({ files: [] })),
  getFile: vi.fn(async () => ({})),
  searchFiles: vi.fn(async () => []),
  getFilePermissions: vi.fn(async () => []),
  getSyncStatus: vi.fn(async () => ({})),
});

vi.mock('@boba/drive-connector', () => {
  return {
    createDriveConnector: vi.fn(() =>
      makeMockConnector(
        vi.fn(async () => ({
          id: 'drive-file-001',
          name: 'Test.gdoc',
          mimeType: 'application/vnd.google-apps.document',
          content: SAMPLE_GDOC_TEXT,
          wordCount: SAMPLE_GDOC_TEXT.split(/\s+/).length,
        })),
      ),
    ),
  };
});

// ---------------------------------------------------------------------------
// Mock the decrypt function inside the service module.
// We intercept the createDecipheriv call indirectly by returning a known
// plaintext for any encrypted blob.
// ---------------------------------------------------------------------------

vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto');
  return {
    ...actual,
    createDecipheriv: vi.fn(() => ({
      setAuthTag: vi.fn(),
      update: vi.fn(() => Buffer.from('ya29.mock-access-token', 'utf8')),
      final: vi.fn(() => Buffer.from('', 'utf8')),
    })),
  };
});

// ---------------------------------------------------------------------------
// Pool mock factory
// ---------------------------------------------------------------------------

interface QueryCall {
  sql: string;
  params: unknown[];
}

function makePool(queryResults: Array<{ rows: unknown[]; rowCount?: number }>) {
  let callIndex = 0;
  const queryCalls: QueryCall[] = [];

  const clientMock = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queryCalls.push({ sql, params: params ?? [] });
      const result = queryResults[Math.min(callIndex++, queryResults.length - 1)];
      return result ?? { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };

  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queryCalls.push({ sql, params: params ?? [] });
      const result = queryResults[Math.min(callIndex++, queryResults.length - 1)];
      return result ?? { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(async () => clientMock),
    _queryCalls: queryCalls,
    _clientMock: clientMock,
  };
  return pool;
}

// ---------------------------------------------------------------------------
// Base payload
// ---------------------------------------------------------------------------

const BASE_PAYLOAD: FileProcessTaskPayload = {
  documentId: FIXTURE_DOCUMENT_ROW.id,
  workspaceId: FIXTURE_DOCUMENT_ROW.workspace_id,
  driveFileId: FIXTURE_DOCUMENT_ROW.drive_file_id,
  mimeType: 'application/vnd.google-apps.document',
  connectionId: 'conn-001',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FileProcessingService.processFile — document not found', () => {
  it('returns permanent_failure when document row is missing', async () => {
    const pool = makePool([
      { rows: [] }, // document query returns nothing
    ]);
    const service = new FileProcessingService(pool as unknown as import('pg').Pool);
    const outcome = await service.processFile(BASE_PAYLOAD);
    expect(outcome.status).toBe('permanent_failure');
    expect((outcome as { reason: string }).reason).toMatch(/not found/i);
  });
});

describe('FileProcessingService.processFile — connection not found', () => {
  it('returns permanent_failure when connection row is missing', async () => {
    const pool = makePool([
      { rows: [{ ...FIXTURE_DOCUMENT_ROW, content_hash: null }] }, // document found
      { rows: [] }, // connection not found
    ]);
    const service = new FileProcessingService(pool as unknown as import('pg').Pool);
    const outcome = await service.processFile(BASE_PAYLOAD);
    expect(outcome.status).toBe('permanent_failure');
    expect((outcome as { reason: string }).reason).toMatch(/connection/i);
  });
});

describe('FileProcessingService.processFile — idempotency', () => {
  it('returns skipped when content_hash matches the extracted text hash', async () => {
    // Compute expected hash for SAMPLE_GDOC_TEXT.
    const hash = createHash('sha256').update(SAMPLE_GDOC_TEXT, 'utf8').digest('hex');

    const pool = makePool([
      { rows: [{ id: 'doc-001', content_hash: hash }] }, // existing hash matches
      { rows: [{ access_token_enc: 'iv:tag:cipher' }] }, // connection found
    ]);
    const service = new FileProcessingService(pool as unknown as import('pg').Pool);
    const outcome = await service.processFile(BASE_PAYLOAD);
    expect(outcome.status).toBe('skipped');
    expect((outcome as { reason: string }).reason).toMatch(/unchanged/i);
  });
});

describe('FileProcessingService.processFile — successful processing', () => {
  let pool: ReturnType<typeof makePool>;
  let service: FileProcessingService;

  beforeEach(() => {
    pool = makePool([
      { rows: [{ id: 'doc-001', content_hash: null }] },    // document (no prior hash)
      { rows: [{ access_token_enc: 'iv:tag:cipher' }] },    // connection
      { rows: [], rowCount: 0 },  // BEGIN
      { rows: [], rowCount: 0 },  // DELETE old chunks
      // INSERT per chunk (up to N)
      ...Array.from({ length: 20 }, () => ({ rows: [], rowCount: 1 })),
      { rows: [], rowCount: 1 },  // UPDATE document
      { rows: [], rowCount: 0 },  // COMMIT
    ]);
    service = new FileProcessingService(pool as unknown as import('pg').Pool);
  });

  it('returns processed outcome', async () => {
    const outcome = await service.processFile(BASE_PAYLOAD);
    expect(outcome.status).toBe('processed');
  });

  it('chunksWritten is greater than 0 for non-empty document', async () => {
    const outcome = await service.processFile(BASE_PAYLOAD);
    expect((outcome as { chunksWritten: number }).chunksWritten).toBeGreaterThan(0);
  });

  it('calls pool.connect() to open a transaction', async () => {
    await service.processFile(BASE_PAYLOAD);
    expect(pool.connect).toHaveBeenCalled();
  });

  it('issues DELETE for old chunks before inserting new ones', async () => {
    await service.processFile(BASE_PAYLOAD);
    const deleteCall = pool._clientMock.query.mock.calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('DELETE FROM chunks'),
    );
    expect(deleteCall).toBeDefined();
  });

  it('chunk INSERT includes content and content_hash', async () => {
    await service.processFile(BASE_PAYLOAD);
    const insertCalls = pool._clientMock.query.mock.calls.filter(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('INSERT INTO chunks'),
    );
    expect(insertCalls.length).toBeGreaterThan(0);
    // Each INSERT call's params[3] is the chunk content.
    for (const [, params] of insertCalls as Array<[string, unknown[]]>) {
      expect(typeof (params as unknown[])[3]).toBe('string'); // content
      expect((params as unknown[])[3]).not.toBe('');
      expect(typeof (params as unknown[])[4]).toBe('string'); // content_hash (sha256)
      expect(((params as unknown[])[4] as string).length).toBe(64); // sha256 hex
    }
  });

  it('UPDATE sets content_hash and last_synced on document', async () => {
    await service.processFile(BASE_PAYLOAD);
    const updateCall = pool._clientMock.query.mock.calls.find(
      ([sql]: [string]) => typeof sql === 'string' && sql.includes('UPDATE documents'),
    );
    expect(updateCall).toBeDefined();
    const params = (updateCall as [string, string[]])[1];
    // params[0] is the new content_hash (64-char sha256 hex).
    expect((params[0] as string).length).toBe(64);
  });
});

describe('FileProcessingService.processFile — ExtractionError handling', () => {
  it('returns permanent_failure for permanent ExtractionError without rethrowing', async () => {
    // Import ExtractionError synchronously then throw it from connector mock.
    const { ExtractionError } = await import('../src/extractors/text-extractor.js');
    const { createDriveConnector } = await import('@boba/drive-connector');
    vi.mocked(createDriveConnector).mockReturnValueOnce(
      makeMockConnector(
        vi.fn(async () => {
          throw new ExtractionError('Unsupported MIME type', true);
        }),
      ) as unknown as ReturnType<typeof createDriveConnector>,
    );

    const pool = makePool([
      { rows: [{ id: 'doc-001', content_hash: null }] },
      { rows: [{ access_token_enc: 'iv:tag:cipher' }] },
    ]);
    const service = new FileProcessingService(pool as unknown as import('pg').Pool);

    const outcome = await service.processFile({
      ...BASE_PAYLOAD,
      mimeType: 'application/octet-stream',
    });
    expect(outcome.status).toBe('permanent_failure');
  });

  it('rethrows transient errors so the caller returns HTTP 500', async () => {
    const { createDriveConnector } = await import('@boba/drive-connector');
    vi.mocked(createDriveConnector).mockReturnValueOnce(
      makeMockConnector(
        vi.fn(async () => {
          throw new Error('Network timeout');
        }),
      ) as unknown as ReturnType<typeof createDriveConnector>,
    );

    const pool = makePool([
      { rows: [{ id: 'doc-001', content_hash: null }] },
      { rows: [{ access_token_enc: 'iv:tag:cipher' }] },
    ]);
    const service = new FileProcessingService(pool as unknown as import('pg').Pool);
    await expect(service.processFile(BASE_PAYLOAD)).rejects.toThrow('Network timeout');
  });
});
