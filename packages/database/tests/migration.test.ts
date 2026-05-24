/**
 * Unit tests for 1_initial_schema migration.
 *
 * Strategy: we exercise the migration's up/down functions with a spy-proxy
 * that records every MigrationBuilder method call.  No live database is
 * required — we verify that the migration emits the correct DDL operations.
 *
 * Coverage:
 *   ✓ All 8 core tables are created in UP
 *   ✓ pgvector extension SQL is emitted
 *   ✓ chunks.embedding uses vector(1536)
 *   ✓ HNSW index is created on chunks.embedding with cosine ops
 *   ✓ Every tenant-scoped table has a workspace_id column with FK
 *   ✓ ON DELETE CASCADE is set on all workspace_id FK columns
 *   ✓ All required B-tree indexes are created
 *   ✓ All 8 tables are dropped in DOWN (in reverse FK order)
 *   ✓ DOWN emits DROP EXTENSION for vector
 *   ✓ Exported CORE_TABLES and TENANT_TABLES match expected values
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { MigrationBuilder } from 'node-pg-migrate';
import { up, down } from '../migrations/1_initial_schema.js';
import { CORE_TABLES, TENANT_TABLES } from '../src/index.js';
import {
  EXPECTED_TABLES,
  EXPECTED_INDEXES,
  TENANT_SCOPED_TABLES,
} from './fixtures/schema.js';

// ---------------------------------------------------------------------------
// Spy proxy helpers
// ---------------------------------------------------------------------------

type CallRecord = {
  method: string;
  args: unknown[];
};

interface SpyPgm extends MigrationBuilder {
  _calls: CallRecord[];
  _sqlStatements: string[];
}

/**
 * Creates a Proxy that records all method calls so tests can assert on them.
 * Covers: createTable, dropTable, createIndex, dropIndex, addConstraint, sql.
 */
function createSpyPgm(): SpyPgm {
  const calls: CallRecord[] = [];
  const sqlStatements: string[] = [];

  return new Proxy(
    { _calls: calls, _sqlStatements: sqlStatements } as SpyPgm,
    {
      get(target, method: string) {
        if (method === '_calls') return target._calls;
        if (method === '_sqlStatements') return target._sqlStatements;

        // Special capture for raw SQL so tests can inspect the strings.
        if (method === 'sql') {
          return (sqlStr: string) => {
            calls.push({ method: 'sql', args: [sqlStr] });
            sqlStatements.push(sqlStr);
          };
        }

        // func() is used as a column default — return a placeholder string.
        if (method === 'func') {
          return (expr: string) => `pgm_func(${expr})`;
        }

        return (...args: unknown[]) => {
          calls.push({ method, args });
        };
      },
    },
  ) as SpyPgm;
}

/** Returns all `createTable` call records. */
function getCreateTableCalls(pgm: SpyPgm) {
  return pgm._calls.filter((c) => c.method === 'createTable');
}

/** Returns all `dropTable` call records. */
function getDropTableCalls(pgm: SpyPgm) {
  return pgm._calls.filter((c) => c.method === 'dropTable');
}

/** Returns all `createIndex` call records. */
function getCreateIndexCalls(pgm: SpyPgm) {
  return pgm._calls.filter((c) => c.method === 'createIndex');
}

// ---------------------------------------------------------------------------
// UP migration tests
// ---------------------------------------------------------------------------

describe('migration UP — 1_initial_schema', () => {
  let pgm: SpyPgm;

  beforeEach(async () => {
    pgm = createSpyPgm();
    await up(pgm as unknown as MigrationBuilder);
  });

  it('creates all 8 core tables', () => {
    const created = getCreateTableCalls(pgm).map((c) => c.args[0] as string);

    for (const table of EXPECTED_TABLES) {
      expect(created, `Missing table: ${table}`).toContain(table);
    }
    expect(created).toHaveLength(EXPECTED_TABLES.length);
  });

  it('emits CREATE EXTENSION IF NOT EXISTS vector', () => {
    const sqlCalls = pgm._sqlStatements;
    const hasExtension = sqlCalls.some((s) =>
      s.toLowerCase().includes('create extension if not exists vector'),
    );
    expect(hasExtension, 'pgvector extension SQL must be emitted').toBe(true);
  });

  it('defines chunks.embedding as vector(1536)', () => {
    const chunksCall = getCreateTableCalls(pgm).find(
      (c) => c.args[0] === 'chunks',
    );
    expect(chunksCall, 'chunks table must be created').toBeDefined();

    const columns = chunksCall!.args[1] as Record<
      string,
      { type: string; notNull?: boolean }
    >;
    expect(columns['embedding']).toBeDefined();
    expect(columns['embedding']!.type).toBe('vector(1536)');
    expect(columns['embedding']!.notNull).toBe(true);
  });

  it('creates HNSW index on chunks.embedding with cosine ops', () => {
    const hnswSql = pgm._sqlStatements.find(
      (s) =>
        s.toLowerCase().includes('hnsw') &&
        s.toLowerCase().includes('vector_cosine_ops'),
    );
    expect(hnswSql, 'HNSW cosine index must be created').toBeDefined();
    expect(hnswSql!.toLowerCase()).toContain('chunks');
    expect(hnswSql!.toLowerCase()).toContain('idx_chunks_embedding');
  });

  it('HNSW index uses recommended m=16 and ef_construction=64 parameters', () => {
    const hnswSql = pgm._sqlStatements.find((s) =>
      s.toLowerCase().includes('hnsw'),
    );
    expect(hnswSql).toBeDefined();
    expect(hnswSql!).toContain('m = 16');
    expect(hnswSql!).toContain('ef_construction = 64');
  });

  it('all tenant-scoped tables have a workspace_id column', () => {
    const tableCalls = getCreateTableCalls(pgm);

    for (const tableName of TENANT_SCOPED_TABLES) {
      const call = tableCalls.find((c) => c.args[0] === tableName);
      expect(call, `${tableName} must be created`).toBeDefined();

      const columns = call!.args[1] as Record<string, { references?: string }>;
      expect(
        columns['workspace_id'],
        `${tableName}.workspace_id column missing`,
      ).toBeDefined();
    }
  });

  it('workspace_id FK columns use ON DELETE CASCADE', () => {
    const tableCalls = getCreateTableCalls(pgm);

    for (const tableName of TENANT_SCOPED_TABLES) {
      const call = tableCalls.find((c) => c.args[0] === tableName);
      const columns = call!.args[1] as Record<
        string,
        { onDelete?: string; references?: string }
      >;
      const wsCol = columns['workspace_id']!;

      expect(
        wsCol.onDelete?.toUpperCase(),
        `${tableName}.workspace_id must CASCADE on delete`,
      ).toBe('CASCADE');
    }
  });

  it('workspaces table is created without workspace_id (root tenant)', () => {
    const call = getCreateTableCalls(pgm).find(
      (c) => c.args[0] === 'workspaces',
    );
    expect(call).toBeDefined();
    const columns = call!.args[1] as Record<string, unknown>;
    expect(columns['workspace_id']).toBeUndefined();
  });

  it('creates all expected B-tree indexes', () => {
    const indexCalls = getCreateIndexCalls(pgm);
    const indexNames = indexCalls.map((c) => {
      const opts = c.args[2] as { name?: string } | undefined;
      return opts?.name ?? '';
    });

    // HNSW index is created via raw SQL, not createIndex — check separately.
    const btreeIndexes = EXPECTED_INDEXES.filter(
      (n) => n !== 'idx_chunks_embedding',
    );

    for (const expectedName of btreeIndexes) {
      expect(
        indexNames,
        `Missing B-tree index: ${expectedName}`,
      ).toContain(expectedName);
    }
  });

  it('chunks table gets a B-tree index on document_id for FK efficiency', () => {
    const indexCalls = getCreateIndexCalls(pgm);
    const hasDocIdx = indexCalls.some((c) => {
      const opts = c.args[2] as { name?: string } | undefined;
      return opts?.name === 'idx_chunks_document_id';
    });
    expect(hasDocIdx).toBe(true);
  });

  it('documents table has drive_file_id B-tree index', () => {
    const indexCalls = getCreateIndexCalls(pgm);
    const hasFileIdx = indexCalls.some((c) => {
      const opts = c.args[2] as { name?: string } | undefined;
      return opts?.name === 'idx_documents_drive_file_id';
    });
    expect(hasFileIdx).toBe(true);
  });

  it('insights table has composite (workspace_id, type) index', () => {
    const indexCalls = getCreateIndexCalls(pgm);
    const compositeIdx = indexCalls.find((c) => {
      const opts = c.args[2] as { name?: string } | undefined;
      return opts?.name === 'idx_insights_workspace_type';
    });
    expect(compositeIdx, 'composite insight index must exist').toBeDefined();
    const cols = compositeIdx!.args[1] as string[];
    expect(cols).toContain('workspace_id');
    expect(cols).toContain('type');
  });
});

// ---------------------------------------------------------------------------
// DOWN migration tests
// ---------------------------------------------------------------------------

describe('migration DOWN — 1_initial_schema', () => {
  let pgm: SpyPgm;

  beforeEach(async () => {
    pgm = createSpyPgm();
    await down(pgm as unknown as MigrationBuilder);
  });

  it('drops all 8 tables', () => {
    const dropped = getDropTableCalls(pgm).map((c) => c.args[0] as string);

    for (const table of EXPECTED_TABLES) {
      expect(dropped, `Table not dropped in DOWN: ${table}`).toContain(table);
    }
  });

  it('drops tables in FK-safe reverse order (workspaces is last)', () => {
    const dropped = getDropTableCalls(pgm).map((c) => c.args[0] as string);
    const workspacesIdx = dropped.indexOf('workspaces');
    const usersIdx = dropped.indexOf('users');
    const contentDraftsIdx = dropped.indexOf('content_drafts');

    // workspaces must be dropped AFTER users and content_drafts.
    expect(workspacesIdx).toBeGreaterThan(usersIdx);
    expect(workspacesIdx).toBeGreaterThan(contentDraftsIdx);
  });

  it('drops content_drafts before workspaces (leaf before root)', () => {
    const dropped = getDropTableCalls(pgm).map((c) => c.args[0] as string);
    expect(dropped.indexOf('content_drafts')).toBeLessThan(
      dropped.indexOf('workspaces'),
    );
  });

  it('drops chunks before documents (FK dependency)', () => {
    const dropped = getDropTableCalls(pgm).map((c) => c.args[0] as string);
    expect(dropped.indexOf('chunks')).toBeLessThan(
      dropped.indexOf('documents'),
    );
  });

  it('emits DROP EXTENSION IF EXISTS vector', () => {
    const hasDropExtension = pgm._sqlStatements.some((s) =>
      s.toLowerCase().includes('drop extension if exists vector'),
    );
    expect(hasDropExtension).toBe(true);
  });

  it('uses IF EXISTS on all DROP TABLE calls for idempotent rollback', () => {
    const dropCalls = getDropTableCalls(pgm);
    for (const call of dropCalls) {
      const opts = call.args[1] as { ifExists?: boolean } | undefined;
      expect(
        opts?.ifExists,
        `dropTable for ${call.args[0]} must use ifExists: true`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Schema index / type exports
// ---------------------------------------------------------------------------

describe('CORE_TABLES and TENANT_TABLES exports', () => {
  it('CORE_TABLES contains all 8 expected tables', () => {
    expect(CORE_TABLES).toHaveLength(8);
    for (const table of EXPECTED_TABLES) {
      expect(CORE_TABLES as readonly string[]).toContain(table);
    }
  });

  it('TENANT_TABLES contains all tables that need workspace_id (7 tables)', () => {
    // workspaces itself does not have a workspace_id FK.
    expect(TENANT_TABLES).toHaveLength(7);
    expect(TENANT_TABLES as string[]).not.toContain('workspaces');
    for (const table of TENANT_SCOPED_TABLES) {
      expect(TENANT_TABLES as string[]).toContain(table);
    }
  });
});
