/**
 * Unit tests for DriveConnectionService.
 *
 * The PostgreSQL pool and TaskQueue are mocked — no database or network calls.
 *
 * Coverage:
 *   ✓ createConnection — encrypts tokens and inserts a row
 *   ✓ createConnection — returns ConnectionStatus without tokens
 *   ✓ createConnection — throws when pool returns no rows
 *   ✓ getConnection — returns null when no connection exists
 *   ✓ getConnection — returns ConnectionStatus when row exists
 *   ✓ updateFolderMappings — returns null when no connection exists
 *   ✓ updateFolderMappings — returns updated ConnectionStatus
 *   ✓ triggerSync — enqueues task with connectionId and workspaceId
 *   ✓ triggerSync — throws when no connection found
 *   ✓ deleteConnection — returns true when a row was deleted
 *   ✓ deleteConnection — returns false when no row matched
 *   ✓ getDecryptedAccessToken — returns null when no connection exists
 *   ✓ getDecryptedAccessToken — decrypts and returns access token
 *   ✓ Encryption round-trip — encrypt then decrypt returns original
 *   ✓ Encryption — same plaintext produces different ciphertexts (IV randomness)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DriveConnectionService } from '../src/services/drive-connection.service.js';
import { MockTaskQueue } from '../src/tasks/task-queue.js';
import {
  FIXTURE_DB_ROW,
  FIXTURE_FOLDER_MAPPINGS,
} from './fixtures/drive-connection.js';

const WORKSPACE_ID = 'ws-001';
const USER_ID = 'user-001';

// Mock config so tests don't need an ENCRYPTION_KEY_HEX env var.
// The key is a valid 32-byte hex string.
vi.mock('../src/config.js', () => ({
  config: {
    nodeEnv: 'test',
    encryptionKeyHex: 'a'.repeat(64), // 32 bytes as hex
    cloudTasks: { queueName: 'drive-sync', serviceUrl: 'http://localhost:8081' },
    // Remaining fields not used by DriveConnectionService:
    databaseUrl: '',
    google: {},
    jwt: {},
    refreshToken: {},
    isTest: true,
  },
}));

// ---------------------------------------------------------------------------
// Helper: build a service instance with a fully controlled pool mock.
// ---------------------------------------------------------------------------

function makeService(poolRows: unknown[], rowCount = poolRows.length) {
  const taskQueue = new MockTaskQueue();
  let callIndex = 0;
  const rowSets = Array.isArray(poolRows[0]) ? poolRows as unknown[][] : [poolRows];

  const pool = {
    query: vi.fn(async () => {
      const rows = rowSets[Math.min(callIndex++, rowSets.length - 1)];
      return { rows: rows ?? [], rowCount };
    }),
  } as unknown as import('pg').Pool;

  const service = new DriveConnectionService(pool, taskQueue);
  return { service, pool, taskQueue };
}

// ---------------------------------------------------------------------------
// createConnection
// ---------------------------------------------------------------------------

describe('DriveConnectionService.createConnection', () => {
  it('inserts a row and returns a ConnectionStatus without tokens', async () => {
    const { service } = makeService([FIXTURE_DB_ROW]);
    const result = await service.createConnection({
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      accessToken: 'ya29.access',
      refreshToken: '1//refresh',
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      expiresAt: null,
    });
    expect(result.id).toBe('conn-001');
    expect(result.status).toBe('connected');
    // No token fields in the returned object.
    expect((result as Record<string, unknown>)['access_token']).toBeUndefined();
    expect((result as Record<string, unknown>)['refresh_token']).toBeUndefined();
  });

  it('passes encrypted tokens (not plaintext) to pool.query', async () => {
    const taskQueue = new MockTaskQueue();
    let capturedParams: unknown[] = [];
    const pool = {
      query: vi.fn(async (_sql: string, params: unknown[]) => {
        capturedParams = params as unknown[];
        return { rows: [FIXTURE_DB_ROW], rowCount: 1 };
      }),
    } as unknown as import('pg').Pool;

    const service = new DriveConnectionService(pool, taskQueue);
    await service.createConnection({
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      accessToken: 'plain-access-token',
      refreshToken: 'plain-refresh-token',
      scopes: [],
      expiresAt: null,
    });

    // Params[2] = access_token_enc, Params[3] = refresh_token_enc
    expect(capturedParams[2]).not.toBe('plain-access-token');
    expect(capturedParams[3]).not.toBe('plain-refresh-token');
    // Encrypted blobs should contain colons (iv:tag:ciphertext format)
    expect(String(capturedParams[2])).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/);
  });

  it('throws when pool returns no rows', async () => {
    const { service } = makeService([]);
    await expect(
      service.createConnection({
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        accessToken: 'tok',
        refreshToken: 'ref',
        scopes: [],
        expiresAt: null,
      }),
    ).rejects.toThrow('Failed to create drive connection');
  });
});

// ---------------------------------------------------------------------------
// getConnection
// ---------------------------------------------------------------------------

describe('DriveConnectionService.getConnection', () => {
  it('returns null when no connection exists', async () => {
    const { service } = makeService([]);
    const result = await service.getConnection(WORKSPACE_ID);
    expect(result).toBeNull();
  });

  it('returns a ConnectionStatus when a row exists', async () => {
    const { service } = makeService([FIXTURE_DB_ROW]);
    const result = await service.getConnection(WORKSPACE_ID);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('conn-001');
    expect(result!.sync_status).toBe('idle');
    expect(result!.files_indexed).toBe(47);
    expect(result!.folder_mappings).toHaveLength(3);
  });

  it('sets status to connected', async () => {
    const { service } = makeService([FIXTURE_DB_ROW]);
    const result = await service.getConnection(WORKSPACE_ID);
    expect(result!.status).toBe('connected');
  });
});

// ---------------------------------------------------------------------------
// updateFolderMappings
// ---------------------------------------------------------------------------

describe('DriveConnectionService.updateFolderMappings', () => {
  it('returns null when no connection row matched', async () => {
    const { service } = makeService([], 0);
    const result = await service.updateFolderMappings(WORKSPACE_ID, []);
    expect(result).toBeNull();
  });

  it('returns updated ConnectionStatus with new mappings', async () => {
    const updatedRow = { ...FIXTURE_DB_ROW, folder_mappings: FIXTURE_FOLDER_MAPPINGS };
    const { service } = makeService([updatedRow]);
    const result = await service.updateFolderMappings(WORKSPACE_ID, FIXTURE_FOLDER_MAPPINGS);
    expect(result).not.toBeNull();
    expect(result!.folder_mappings).toHaveLength(3);
    expect(result!.folder_mappings[0]!.module).toBe('brand');
  });

  it('passes JSON-serialised mappings to pool.query', async () => {
    let capturedParams: unknown[] = [];
    const pool = {
      query: vi.fn(async (_sql: string, params: unknown[]) => {
        capturedParams = params as unknown[];
        return { rows: [FIXTURE_DB_ROW], rowCount: 1 };
      }),
    } as unknown as import('pg').Pool;
    const service = new DriveConnectionService(pool, new MockTaskQueue());

    await service.updateFolderMappings(WORKSPACE_ID, FIXTURE_FOLDER_MAPPINGS);

    // First param is the JSON-stringified mappings
    expect(typeof capturedParams[0]).toBe('string');
    const parsed = JSON.parse(capturedParams[0] as string) as unknown[];
    expect(parsed).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// triggerSync
// ---------------------------------------------------------------------------

describe('DriveConnectionService.triggerSync', () => {
  it('enqueues a task with connectionId and workspaceId', async () => {
    const { service, taskQueue } = makeService([{ id: 'conn-001' }]);
    await service.triggerSync(WORKSPACE_ID);
    expect(taskQueue.enqueuedTasks).toHaveLength(1);
    expect(taskQueue.enqueuedTasks[0]).toEqual({
      connectionId: 'conn-001',
      workspaceId: WORKSPACE_ID,
    });
  });

  it('throws when no connection found', async () => {
    const { service } = makeService([]);
    await expect(service.triggerSync(WORKSPACE_ID)).rejects.toThrow(
      'No Drive connection found',
    );
  });
});

// ---------------------------------------------------------------------------
// deleteConnection
// ---------------------------------------------------------------------------

describe('DriveConnectionService.deleteConnection', () => {
  it('returns true when a row was deleted', async () => {
    const { service } = makeService([], 1);
    const result = await service.deleteConnection(WORKSPACE_ID);
    expect(result).toBe(true);
  });

  it('returns false when no row matched', async () => {
    const { service } = makeService([], 0);
    const result = await service.deleteConnection(WORKSPACE_ID);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getDecryptedAccessToken
// ---------------------------------------------------------------------------

describe('DriveConnectionService.getDecryptedAccessToken', () => {
  it('returns null when no connection exists', async () => {
    const { service } = makeService([]);
    const result = await service.getDecryptedAccessToken(WORKSPACE_ID);
    expect(result).toBeNull();
  });

  it('encrypts and decrypts the token round-trip', async () => {
    // Create a service that first encrypts (createConnection) then decrypts.
    const taskQueue = new MockTaskQueue();
    let storedEncrypted: string | undefined;

    const pool = {
      query: vi.fn(async (_sql: string, params: unknown[]) => {
        // First call: createConnection — capture the encrypted token
        if (storedEncrypted === undefined) {
          storedEncrypted = params[2] as string;
          return { rows: [FIXTURE_DB_ROW], rowCount: 1 };
        }
        // Second call: getDecryptedAccessToken — return the stored encrypted token
        return { rows: [{ access_token_enc: storedEncrypted }], rowCount: 1 };
      }),
    } as unknown as import('pg').Pool;

    const service = new DriveConnectionService(pool, taskQueue);

    await service.createConnection({
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      accessToken: 'original-access-token',
      refreshToken: 'ref',
      scopes: [],
      expiresAt: null,
    });

    const decrypted = await service.getDecryptedAccessToken(WORKSPACE_ID);
    expect(decrypted).toBe('original-access-token');
  });
});

// ---------------------------------------------------------------------------
// Encryption properties
// ---------------------------------------------------------------------------

describe('DriveConnectionService — encryption properties', () => {
  it('same plaintext produces different ciphertexts due to random IV', async () => {
    const taskQueue = new MockTaskQueue();
    const encrypted: string[] = [];

    const pool = {
      query: vi.fn(async (_sql: string, params: unknown[]) => {
        encrypted.push(params[2] as string);
        return { rows: [FIXTURE_DB_ROW], rowCount: 1 };
      }),
    } as unknown as import('pg').Pool;

    const service = new DriveConnectionService(pool, taskQueue);
    const input = {
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      accessToken: 'same-token',
      refreshToken: 'ref',
      scopes: [],
      expiresAt: null,
    };

    await service.createConnection(input);
    await service.createConnection(input);

    expect(encrypted).toHaveLength(2);
    // Different IVs → different ciphertexts
    expect(encrypted[0]).not.toBe(encrypted[1]);
  });
});
