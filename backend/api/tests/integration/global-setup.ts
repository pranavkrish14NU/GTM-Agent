/**
 * Vitest global setup — runs once before all integration test files.
 *
 * Responsibilities:
 *   1. Generate RSA key pair for JWT signing (stored in process.env for workers)
 *   2. Connect to test PostgreSQL database
 *   3. Create the schema (pgvector extension + all BOBA tables)
 *   4. Seed test data (two workspaces, multiple users, documents, insights)
 *
 * Corresponding teardown: drops all test tables.
 */

import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Key pair generation — store in env so workers inherit them
// ---------------------------------------------------------------------------

function generateRsaKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}

// ---------------------------------------------------------------------------
// Schema SQL — creates all tables needed for integration tests
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'starter',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, email)
);

-- Drive connections table
CREATE TABLE IF NOT EXISTS drive_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'connected',
  encrypted_token TEXT,
  files_synced    INT NOT NULL DEFAULT 0,
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  mime_type    TEXT NOT NULL DEFAULT 'application/pdf',
  freshness    TEXT NOT NULL DEFAULT 'fresh',
  size_bytes   BIGINT NOT NULL DEFAULT 0,
  drive_url    TEXT,
  content_hash TEXT,
  modified_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chunks table (embeddings)
CREATE TABLE IF NOT EXISTS chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  embedding    vector(1536),
  chunk_index  INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Queries table (RAG conversations)
CREATE TABLE IF NOT EXISTS queries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question     TEXT NOT NULL,
  answer       TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insights table
CREATE TABLE IF NOT EXISTS insights (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  dimension        TEXT NOT NULL,
  score            INT NOT NULL DEFAULT 0,
  trend            TEXT NOT NULL DEFAULT 'stable',
  meaning          TEXT,
  recommendation   TEXT,
  period           TEXT,
  last_analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Content drafts table
CREATE TABLE IF NOT EXISTS content_drafts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  body             TEXT NOT NULL,
  content_type     TEXT NOT NULL DEFAULT 'blog_post',
  tone             TEXT NOT NULL DEFAULT 'professional',
  brand_voice_score INT NOT NULL DEFAULT 0,
  persona_fit_score INT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'draft',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email  TEXT,
  action       TEXT NOT NULL,
  description  TEXT NOT NULL,
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

// ---------------------------------------------------------------------------
// Test data constants (exported for use in seed and test files)
// ---------------------------------------------------------------------------

// Workspace A — primary test workspace
export const WS_A_ID = '00000000-0000-0000-0000-000000000001';
export const WS_A_NAME = 'Integration Test Workspace A';

// Workspace B — for cross-tenant isolation tests
export const WS_B_ID = '00000000-0000-0000-0000-000000000002';
export const WS_B_NAME = 'Integration Test Workspace B';

// Users in Workspace A
export const USER_ADMIN_ID = '00000000-0000-0000-0001-000000000001';
export const USER_MEMBER_ID = '00000000-0000-0000-0001-000000000002';
export const USER_VIEWER_ID = '00000000-0000-0000-0001-000000000003';

// User in Workspace B (admin)
export const USER_B_ADMIN_ID = '00000000-0000-0000-0002-000000000001';

// Documents in Workspace A
export const DOC_A_ID = '00000000-0000-0000-0003-000000000001';

// Document in Workspace B (should be invisible to Workspace A users)
export const DOC_B_ID = '00000000-0000-0000-0003-000000000002';

// Drive connection in Workspace A
export const CONN_A_ID = '00000000-0000-0000-0004-000000000001';

// ---------------------------------------------------------------------------
// Global setup function
// ---------------------------------------------------------------------------

export async function setup() {
  // Step 1: Generate RSA key pair and store in env for workers
  const { privateKeyPem, publicKeyPem } = generateRsaKeyPair();
  process.env['__INT_JWT_PRIVATE_KEY_PEM'] = privateKeyPem;
  process.env['__INT_JWT_PUBLIC_KEY_PEM'] = publicKeyPem;
  process.env['JWT_PRIVATE_KEY_PEM'] = privateKeyPem;
  process.env['JWT_PUBLIC_KEY_PEM'] = publicKeyPem;
  process.env['JWT_ISSUER'] = 'https://test.boba.app';
  process.env['JWT_AUDIENCE'] = 'boba-api-test';

  const testDbUrl =
    process.env['TEST_DATABASE_URL'] ??
    'postgresql://boba_test:boba_test@localhost:5433/boba_test';

  process.env['DATABASE_URL'] = testDbUrl;
  process.env['NODE_ENV'] = 'test';

  // Step 2: Connect to test database
  const pool = new Pool({ connectionString: testDbUrl });

  // Step 3: Create schema
  await pool.query(SCHEMA_SQL);

  // Step 4: Seed test data
  await seedTestData(pool);

  await pool.end();

  console.log('[integration] Schema created and test data seeded.');
}

// ---------------------------------------------------------------------------
// Teardown — drop all test tables
// ---------------------------------------------------------------------------

export async function teardown() {
  const testDbUrl =
    process.env['TEST_DATABASE_URL'] ??
    'postgresql://boba_test:boba_test@localhost:5433/boba_test';

  const pool = new Pool({ connectionString: testDbUrl });

  // Drop in reverse dependency order
  await pool.query(`
    DROP TABLE IF EXISTS audit_logs CASCADE;
    DROP TABLE IF EXISTS refresh_tokens CASCADE;
    DROP TABLE IF EXISTS content_drafts CASCADE;
    DROP TABLE IF EXISTS insights CASCADE;
    DROP TABLE IF EXISTS queries CASCADE;
    DROP TABLE IF EXISTS chunks CASCADE;
    DROP TABLE IF EXISTS documents CASCADE;
    DROP TABLE IF EXISTS drive_connections CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS workspaces CASCADE;
  `);

  await pool.end();
  console.log('[integration] Test tables dropped.');
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

async function seedTestData(pool: pg.Pool): Promise<void> {
  // Truncate in case of re-run
  await pool.query(`
    TRUNCATE TABLE audit_logs, refresh_tokens, content_drafts, insights, queries,
                   chunks, documents, drive_connections, users, workspaces
    RESTART IDENTITY CASCADE;
  `).catch(() => { /* tables may not exist yet on first run */ });

  // Workspaces
  await pool.query(
    `INSERT INTO workspaces (id, name, plan) VALUES ($1, $2, 'pro'), ($3, $4, 'starter')
     ON CONFLICT (id) DO NOTHING`,
    [WS_A_ID, WS_A_NAME, WS_B_ID, WS_B_NAME],
  );

  // Users — Workspace A
  await pool.query(
    `INSERT INTO users (id, workspace_id, email, display_name, role) VALUES
      ($1, $2, 'admin@test.boba', 'Admin User', 'admin'),
      ($3, $2, 'member@test.boba', 'Member User', 'member'),
      ($4, $2, 'viewer@test.boba', 'Viewer User', 'viewer')
     ON CONFLICT (workspace_id, email) DO NOTHING`,
    [USER_ADMIN_ID, WS_A_ID, USER_MEMBER_ID, USER_VIEWER_ID],
  );

  // Users — Workspace B
  await pool.query(
    `INSERT INTO users (id, workspace_id, email, display_name, role)
     VALUES ($1, $2, 'admin-b@test.boba', 'Admin B', 'admin')
     ON CONFLICT (workspace_id, email) DO NOTHING`,
    [USER_B_ADMIN_ID, WS_B_ID],
  );

  // Drive connection — Workspace A
  await pool.query(
    `INSERT INTO drive_connections (id, workspace_id, email, status, files_synced)
     VALUES ($1, $2, 'admin@test.boba', 'connected', 10)
     ON CONFLICT (id) DO NOTHING`,
    [CONN_A_ID, WS_A_ID],
  );

  // Documents
  await pool.query(
    `INSERT INTO documents (id, workspace_id, name, mime_type, freshness, size_bytes)
     VALUES
       ($1, $2, 'Test Document A.pdf', 'application/pdf', 'fresh', 102400),
       ($3, $4, 'Workspace B Secret.pdf', 'application/pdf', 'fresh', 51200)
     ON CONFLICT (id) DO NOTHING`,
    [DOC_A_ID, WS_A_ID, DOC_B_ID, WS_B_ID],
  );

  // Insights — Workspace A
  await pool.query(
    `INSERT INTO insights (workspace_id, dimension, score, trend, meaning, recommendation)
     VALUES ($1, 'messaging', 78, 'improving', 'Messaging clarity is strong', 'Refine enterprise copy')
     ON CONFLICT DO NOTHING`,
    [WS_A_ID],
  );

  // Audit logs — Workspace A
  await pool.query(
    `INSERT INTO audit_logs (workspace_id, actor_id, actor_email, action, description)
     VALUES ($1, $2, 'admin@test.boba', 'drive_connected', 'Connected Drive for integration test')`,
    [WS_A_ID, USER_ADMIN_ID],
  );
}
