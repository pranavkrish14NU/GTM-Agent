/**
 * DriveConnectionService — manages the lifecycle of Drive connections.
 *
 * Responsibilities:
 *   - Encrypt Google OAuth tokens before persisting them.
 *   - Create, read, update, and delete drive_connections rows.
 *   - Update folder-to-module mappings.
 *   - Enqueue Drive sync tasks via the TaskQueue abstraction.
 *
 * Design decisions:
 *   - Tokens are encrypted with AES-256-GCM using a key from config.  Each
 *     encrypted blob contains a random 12-byte IV and a 16-byte auth tag so
 *     the same plaintext produces a different ciphertext every time.
 *   - The service never returns decrypted tokens in its public API — callers
 *     receive sanitised views that omit sensitive fields.
 *   - TaskQueue is injected so tests can use MockTaskQueue without network.
 *   - All queries use workspace_id scoping (enforced by the caller passing the
 *     workspace_id from the verified JWT).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { Pool } from 'pg';
import type { FolderMapping, SyncStatus, SyncHealth } from '@boba/database';
import { config } from '../config.js';
import type { TaskQueue } from '../tasks/task-queue.js';

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export interface CreateConnectionInput {
  workspaceId: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  expiresAt: Date | null;
}

export interface ConnectionStatus {
  id: string;
  status: 'connected' | 'disconnected';
  sync_status: SyncStatus;
  sync_health: SyncHealth | null;
  files_indexed: number;
  last_sync_at: Date | null;
  folder_mappings: FolderMapping[];
  scopes: string[];
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Encrypts `plaintext` with AES-256-GCM.
 * Returns a colon-separated string: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`.
 */
function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a blob produced by `encrypt()`.
 * Throws if the auth tag does not match (tampered ciphertext).
 */
function decrypt(blob: string, keyHex: string): string {
  const [ivHex, tagHex, cipherHex] = blob.split(':');
  if (!ivHex || !tagHex || !cipherHex) {
    throw new Error('Malformed encrypted token blob');
  }
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex').slice(0, TAG_BYTES);
  const ciphertext = Buffer.from(cipherHex, 'hex');
  // Pass authTagLength in the options to prevent GCM truncation attacks —
  // without it, a shorter-than-expected tag could be accepted by the decipher.
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
}

// ---------------------------------------------------------------------------
// DriveConnectionService
// ---------------------------------------------------------------------------

export class DriveConnectionService {
  private readonly pool: Pool;
  private readonly taskQueue: TaskQueue;
  private readonly keyHex: string;

  constructor(pool: Pool, taskQueue: TaskQueue) {
    this.pool = pool;
    this.taskQueue = taskQueue;
    this.keyHex = config.encryptionKeyHex;
  }

  // -------------------------------------------------------------------------
  // createConnection
  // -------------------------------------------------------------------------

  /**
   * Encrypts tokens and inserts a new drive_connections row.
   * If a connection already exists for this workspace + user, upserts it.
   *
   * Returns the sanitised ConnectionStatus (no decrypted tokens).
   */
  async createConnection(input: CreateConnectionInput): Promise<ConnectionStatus> {
    const accessTokenEnc = encrypt(input.accessToken, this.keyHex);
    const refreshTokenEnc = encrypt(input.refreshToken, this.keyHex);

    const result = await this.pool.query<{
      id: string;
      workspace_id: string;
      scopes: string[];
      expires_at: Date | null;
      folder_mappings: FolderMapping[];
      sync_status: SyncStatus;
      files_indexed: number;
      last_sync_at: Date | null;
      sync_health: SyncHealth | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO drive_connections
         (workspace_id, user_id, access_token_enc, refresh_token_enc, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET
         access_token_enc = EXCLUDED.access_token_enc,
         refresh_token_enc = EXCLUDED.refresh_token_enc,
         scopes = EXCLUDED.scopes,
         expires_at = EXCLUDED.expires_at,
         updated_at = now()
       RETURNING
         id, workspace_id, scopes, expires_at,
         folder_mappings, sync_status, files_indexed, last_sync_at, sync_health,
         created_at, updated_at`,
      [
        input.workspaceId,
        input.userId,
        accessTokenEnc,
        refreshTokenEnc,
        input.scopes,
        input.expiresAt,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error('Failed to create drive connection');

    return this.toConnectionStatus(row);
  }

  // -------------------------------------------------------------------------
  // getConnection
  // -------------------------------------------------------------------------

  /**
   * Returns the current connection status for the workspace.
   * Returns null if no connection exists.
   */
  async getConnection(workspaceId: string): Promise<ConnectionStatus | null> {
    const result = await this.pool.query<{
      id: string;
      workspace_id: string;
      scopes: string[];
      expires_at: Date | null;
      folder_mappings: FolderMapping[];
      sync_status: SyncStatus;
      files_indexed: number;
      last_sync_at: Date | null;
      sync_health: SyncHealth | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, workspace_id, scopes, expires_at,
              folder_mappings, sync_status, files_indexed, last_sync_at, sync_health,
              created_at, updated_at
       FROM drive_connections
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [workspaceId],
    );

    if (result.rows.length === 0) return null;
    return this.toConnectionStatus(result.rows[0]!);
  }

  // -------------------------------------------------------------------------
  // updateFolderMappings
  // -------------------------------------------------------------------------

  /**
   * Replaces the folder_mappings JSONB for the workspace's connection.
   * Returns the updated ConnectionStatus or null if no connection found.
   */
  async updateFolderMappings(
    workspaceId: string,
    mappings: FolderMapping[],
  ): Promise<ConnectionStatus | null> {
    const result = await this.pool.query<{
      id: string;
      workspace_id: string;
      scopes: string[];
      expires_at: Date | null;
      folder_mappings: FolderMapping[];
      sync_status: SyncStatus;
      files_indexed: number;
      last_sync_at: Date | null;
      sync_health: SyncHealth | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `UPDATE drive_connections
       SET folder_mappings = $1::jsonb, updated_at = now()
       WHERE workspace_id = $2
       RETURNING
         id, workspace_id, scopes, expires_at,
         folder_mappings, sync_status, files_indexed, last_sync_at, sync_health,
         created_at, updated_at`,
      [JSON.stringify(mappings), workspaceId],
    );

    if (result.rows.length === 0) return null;
    return this.toConnectionStatus(result.rows[0]!);
  }

  // -------------------------------------------------------------------------
  // triggerSync
  // -------------------------------------------------------------------------

  /**
   * Enqueues a Drive sync task for the workspace's connection.
   * Throws if no connection exists.
   */
  async triggerSync(workspaceId: string): Promise<void> {
    const result = await this.pool.query<{ id: string }>(
      'SELECT id FROM drive_connections WHERE workspace_id = $1 LIMIT 1',
      [workspaceId],
    );

    if (result.rows.length === 0) {
      throw new Error('No Drive connection found for this workspace');
    }

    const connectionId = result.rows[0]!.id;
    await this.taskQueue.enqueueSyncTask({ connectionId, workspaceId });
  }

  // -------------------------------------------------------------------------
  // deleteConnection
  // -------------------------------------------------------------------------

  /**
   * Deletes the drive connection for the workspace.
   * Returns true if a row was deleted, false if none existed.
   *
   * Token revocation with Google is the caller's responsibility (requires the
   * decrypted access token which this method intentionally avoids returning).
   * The route handler decrypts and revokes before calling this method.
   */
  async deleteConnection(workspaceId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM drive_connections WHERE workspace_id = $1',
      [workspaceId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  // -------------------------------------------------------------------------
  // getDecryptedAccessToken (internal — used by route to revoke before delete)
  // -------------------------------------------------------------------------

  /**
   * Returns the decrypted access token for the workspace's connection.
   * Used by the DELETE route to revoke the token with Google before removing
   * the connection record.  Returns null if no connection found.
   */
  async getDecryptedAccessToken(workspaceId: string): Promise<string | null> {
    const result = await this.pool.query<{ access_token_enc: string }>(
      'SELECT access_token_enc FROM drive_connections WHERE workspace_id = $1 LIMIT 1',
      [workspaceId],
    );

    if (result.rows.length === 0) return null;
    return decrypt(result.rows[0]!.access_token_enc, this.keyHex);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private toConnectionStatus(row: {
    id: string;
    scopes: string[];
    expires_at: Date | null;
    folder_mappings: FolderMapping[];
    sync_status: SyncStatus;
    files_indexed: number;
    last_sync_at: Date | null;
    sync_health: SyncHealth | null;
    created_at: Date;
    updated_at: Date;
  }): ConnectionStatus {
    return {
      id: row.id,
      status: 'connected',
      sync_status: row.sync_status,
      sync_health: row.sync_health,
      files_indexed: row.files_indexed,
      last_sync_at: row.last_sync_at,
      folder_mappings: row.folder_mappings ?? [],
      scopes: row.scopes,
      expires_at: row.expires_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
