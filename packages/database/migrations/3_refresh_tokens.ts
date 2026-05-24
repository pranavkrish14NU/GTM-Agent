/**
 * Migration 3: refresh_tokens table
 *
 * Creates the refresh_tokens table used by the Auth service for secure
 * refresh-token rotation.  Only the SHA-256 hash of each opaque token is
 * stored — the raw token is never persisted.
 *
 * Why a separate migration?  The initial schema (1_initial_schema.ts) covers
 * core domain tables; auth infrastructure (session management) is a distinct
 * concern and benefits from an independent migration so it can be rolled back
 * without touching domain data.
 */

import type { MigrationBuilder } from 'node-pg-migrate';

// ---------------------------------------------------------------------------
// Up
// ---------------------------------------------------------------------------

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  text        NOT NULL UNIQUE,
      expires_at  timestamptz NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Fast lookup by hash (every token exchange does a DELETE WHERE token_hash = $1).
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash
      ON refresh_tokens (token_hash)
  `);

  // Useful for admin queries — e.g. "revoke all sessions for user".
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
      ON refresh_tokens (user_id)
  `);

  // Grant the application role the minimum necessary privileges.
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'boba_app') THEN
        GRANT SELECT, INSERT, DELETE ON refresh_tokens TO boba_app;
      END IF;
    END $$
  `);
}

// ---------------------------------------------------------------------------
// Down
// ---------------------------------------------------------------------------

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'boba_app') THEN
        REVOKE SELECT, INSERT, DELETE ON refresh_tokens FROM boba_app;
      END IF;
    END $$
  `);

  pgm.sql(`DROP TABLE IF EXISTS refresh_tokens`);
}
