/**
 * Unit tests for 2_rls_policies migration.
 *
 * Strategy: same spy-proxy pattern as migration.test.ts — records every raw
 * SQL statement emitted by the migration and asserts on the expected DDL.
 * No live database is required.
 *
 * Coverage:
 *   ✓ boba_app role creation guard (IF NOT EXISTS) is emitted
 *   ✓ RLS is ENABLED on all 8 tables in UP
 *   ✓ FORCE ROW LEVEL SECURITY is applied on all 8 tables in UP
 *   ✓ workspace_isolation policy is created on all 8 tables
 *   ✓ workspaces policy uses id column (not workspace_id)
 *   ✓ Tenant-table policies use workspace_id column
 *   ✓ Session variable app.current_workspace_id used in every policy
 *   ✓ WITH CHECK clause present on every policy (blocks inserts to wrong WS)
 *   ✓ GRANT USAGE ON SCHEMA public TO boba_app is emitted
 *   ✓ GRANT SELECT/INSERT/UPDATE/DELETE to boba_app is emitted
 *   ✓ DOWN disables RLS on all 8 tables
 *   ✓ DOWN drops workspace_isolation policy on all 8 tables
 *   ✓ DOWN emits NO FORCE ROW LEVEL SECURITY
 *   ✓ DOWN revokes permissions from boba_app
 *   ✓ DOWN drops boba_app role
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { MigrationBuilder } from 'node-pg-migrate';
import { up, down } from '../migrations/2_rls_policies.js';
import {
  ALL_TABLES,
  TENANT_TABLES,
  REQUIRED_SQL_FRAGMENTS,
  DOWN_SQL_FRAGMENTS,
} from './fixtures/rls.js';

// ---------------------------------------------------------------------------
// Spy proxy helpers (same pattern as migration.test.ts)
// ---------------------------------------------------------------------------

type CallRecord = { method: string; args: unknown[] };

interface SpyPgm extends MigrationBuilder {
  _calls: CallRecord[];
  _sqlStatements: string[];
}

function createSpyPgm(): SpyPgm {
  const calls: CallRecord[] = [];
  const sqlStatements: string[] = [];

  return new Proxy(
    { _calls: calls, _sqlStatements: sqlStatements } as SpyPgm,
    {
      get(target, method: string) {
        if (method === '_calls') return target._calls;
        if (method === '_sqlStatements') return target._sqlStatements;

        if (method === 'sql') {
          return (sqlStr: string) => {
            calls.push({ method: 'sql', args: [sqlStr] });
            sqlStatements.push(sqlStr);
          };
        }
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

/** Check whether any SQL statement contains all of the given substrings. */
function hasSql(statements: string[], ...substrings: string[]): boolean {
  return statements.some((s) =>
    substrings.every((sub) => s.includes(sub)),
  );
}

/** Count SQL statements containing all of the given substrings. */
function countSql(statements: string[], ...substrings: string[]): number {
  return statements.filter((s) =>
    substrings.every((sub) => s.includes(sub)),
  ).length;
}

// ---------------------------------------------------------------------------
// UP migration tests
// ---------------------------------------------------------------------------

describe('migration UP — 2_rls_policies', () => {
  let pgm: SpyPgm;

  beforeEach(async () => {
    pgm = createSpyPgm();
    await up(pgm as unknown as MigrationBuilder);
  });

  it('creates the boba_app role with IF NOT EXISTS guard', () => {
    const hasRole = hasSql(pgm._sqlStatements, 'boba_app', 'IF NOT EXISTS');
    expect(hasRole, 'boba_app role creation guard must be emitted').toBe(true);
  });

  it('enables RLS on all 8 core tables', () => {
    for (const table of ALL_TABLES) {
      const hasEnable = hasSql(
        pgm._sqlStatements,
        `ALTER TABLE ${table}`,
        'ENABLE ROW LEVEL SECURITY',
      );
      expect(
        hasEnable,
        `ENABLE ROW LEVEL SECURITY missing for table: ${table}`,
      ).toBe(true);
    }
  });

  it('applies FORCE ROW LEVEL SECURITY on all 8 tables', () => {
    for (const table of ALL_TABLES) {
      const hasForce = hasSql(
        pgm._sqlStatements,
        `ALTER TABLE ${table}`,
        'FORCE ROW LEVEL SECURITY',
      );
      expect(
        hasForce,
        `FORCE ROW LEVEL SECURITY missing for table: ${table}`,
      ).toBe(true);
    }
  });

  it('creates workspace_isolation policy on all 8 tables', () => {
    for (const table of ALL_TABLES) {
      const hasPolicy = hasSql(
        pgm._sqlStatements,
        'CREATE POLICY workspace_isolation',
        `ON ${table}`,
      );
      expect(
        hasPolicy,
        `workspace_isolation policy missing for table: ${table}`,
      ).toBe(true);
    }
  });

  it('workspaces policy uses id column (not workspace_id)', () => {
    const wsPolicy = pgm._sqlStatements.find(
      (s) =>
        s.includes('CREATE POLICY workspace_isolation') &&
        s.includes('ON workspaces'),
    );
    expect(wsPolicy, 'workspaces policy must exist').toBeDefined();
    expect(wsPolicy!).toContain('id =');
    expect(wsPolicy!).not.toContain('workspace_id =');
  });

  it('tenant-table policies use workspace_id column', () => {
    for (const table of TENANT_TABLES) {
      const policy = pgm._sqlStatements.find(
        (s) =>
          s.includes('CREATE POLICY workspace_isolation') &&
          s.includes(`ON ${table}`),
      );
      expect(policy, `${table} policy must exist`).toBeDefined();
      expect(policy!).toContain('workspace_id =');
    }
  });

  it('every policy references the app.current_workspace_id session variable', () => {
    const policyCount = countSql(
      pgm._sqlStatements,
      'CREATE POLICY workspace_isolation',
    );
    const withVariableCount = countSql(
      pgm._sqlStatements,
      'CREATE POLICY workspace_isolation',
      REQUIRED_SQL_FRAGMENTS.sessionVariable,
    );
    expect(policyCount).toBe(ALL_TABLES.length);
    expect(withVariableCount).toBe(ALL_TABLES.length);
  });

  it('every policy includes a WITH CHECK clause to block wrong-workspace inserts', () => {
    const policyStatements = pgm._sqlStatements.filter((s) =>
      s.includes('CREATE POLICY workspace_isolation'),
    );
    expect(policyStatements).toHaveLength(ALL_TABLES.length);
    for (const stmt of policyStatements) {
      expect(stmt, 'WITH CHECK must be present on every policy').toContain(
        'WITH CHECK',
      );
    }
  });

  it('uses current_setting with missing_ok=true to prevent errors when variable is not set', () => {
    const policyStatements = pgm._sqlStatements.filter((s) =>
      s.includes('CREATE POLICY workspace_isolation'),
    );
    for (const stmt of policyStatements) {
      // current_setting('app.current_workspace_id', true) — second arg is missing_ok
      expect(stmt).toContain("current_setting('app.current_workspace_id', true)");
    }
  });

  it('grants USAGE on schema public to boba_app', () => {
    const hasGrant = hasSql(
      pgm._sqlStatements,
      'GRANT USAGE ON SCHEMA public TO boba_app',
    );
    expect(hasGrant, 'GRANT USAGE ON SCHEMA public must be emitted').toBe(true);
  });

  it('grants SELECT, INSERT, UPDATE, DELETE to boba_app on all tables', () => {
    const hasGrant = hasSql(
      pgm._sqlStatements,
      'GRANT SELECT, INSERT, UPDATE, DELETE',
      'boba_app',
    );
    expect(hasGrant, 'DML GRANT to boba_app must be emitted').toBe(true);

    // Verify all tables are included in the grant statement.
    const grantStmt = pgm._sqlStatements.find(
      (s) =>
        s.includes('GRANT SELECT, INSERT, UPDATE, DELETE') &&
        s.includes('boba_app'),
    );
    expect(grantStmt).toBeDefined();
    for (const table of ALL_TABLES) {
      expect(
        grantStmt!,
        `${table} must appear in DML GRANT`,
      ).toContain(table);
    }
  });
});

// ---------------------------------------------------------------------------
// DOWN migration tests
// ---------------------------------------------------------------------------

describe('migration DOWN — 2_rls_policies', () => {
  let pgm: SpyPgm;

  beforeEach(async () => {
    pgm = createSpyPgm();
    await down(pgm as unknown as MigrationBuilder);
  });

  it('drops workspace_isolation policy on all 8 tables', () => {
    for (const table of ALL_TABLES) {
      const hasDrop = hasSql(
        pgm._sqlStatements,
        'DROP POLICY IF EXISTS workspace_isolation',
        `ON ${table}`,
      );
      expect(
        hasDrop,
        `DROP POLICY IF EXISTS workspace_isolation missing for table: ${table}`,
      ).toBe(true);
    }
  });

  it('disables FORCE ROW LEVEL SECURITY on all 8 tables', () => {
    for (const table of ALL_TABLES) {
      const hasNoForce = hasSql(
        pgm._sqlStatements,
        `ALTER TABLE ${table}`,
        'NO FORCE ROW LEVEL SECURITY',
      );
      expect(
        hasNoForce,
        `NO FORCE ROW LEVEL SECURITY missing for table: ${table}`,
      ).toBe(true);
    }
  });

  it('disables RLS on all 8 tables', () => {
    for (const table of ALL_TABLES) {
      const hasDisable = hasSql(
        pgm._sqlStatements,
        `ALTER TABLE ${table}`,
        'DISABLE ROW LEVEL SECURITY',
      );
      expect(
        hasDisable,
        `DISABLE ROW LEVEL SECURITY missing for table: ${table}`,
      ).toBe(true);
    }
  });

  it('revokes USAGE on schema public from boba_app', () => {
    const hasRevoke = hasSql(
      pgm._sqlStatements,
      'REVOKE USAGE ON SCHEMA public FROM boba_app',
    );
    expect(hasRevoke, 'REVOKE USAGE ON SCHEMA public must be emitted').toBe(
      true,
    );
  });

  it('revokes DML permissions from boba_app', () => {
    const hasRevoke = hasSql(
      pgm._sqlStatements,
      'REVOKE SELECT, INSERT, UPDATE, DELETE',
      'boba_app',
    );
    expect(hasRevoke, 'REVOKE DML from boba_app must be emitted').toBe(true);
  });

  it('drops the boba_app role with IF EXISTS guard', () => {
    const hasDrop = hasSql(
      pgm._sqlStatements,
      'DROP ROLE boba_app',
      'IF EXISTS',
    );
    expect(hasDrop, 'DROP ROLE boba_app with IF EXISTS must be emitted').toBe(
      true,
    );
  });

  it('revokes permissions before dropping policies (correct order)', () => {
    const revokeIdx = pgm._sqlStatements.findIndex(
      (s) => s.includes('REVOKE SELECT, INSERT, UPDATE, DELETE') && s.includes('boba_app'),
    );
    const firstPolicyDropIdx = pgm._sqlStatements.findIndex((s) =>
      s.includes('DROP POLICY IF EXISTS workspace_isolation'),
    );
    expect(revokeIdx).toBeGreaterThanOrEqual(0);
    expect(firstPolicyDropIdx).toBeGreaterThanOrEqual(0);
    expect(
      revokeIdx,
      'REVOKE must come before DROP POLICY',
    ).toBeLessThan(firstPolicyDropIdx);
  });

  it('drops boba_app role after policies are removed', () => {
    const dropRoleIdx = pgm._sqlStatements.findIndex(
      (s) => s.includes('DROP ROLE boba_app'),
    );
    const lastPolicyDropIdx = pgm._sqlStatements.reduce(
      (lastIdx, s, i) =>
        s.includes('DROP POLICY IF EXISTS workspace_isolation') ? i : lastIdx,
      -1,
    );
    expect(dropRoleIdx).toBeGreaterThanOrEqual(0);
    expect(lastPolicyDropIdx).toBeGreaterThanOrEqual(0);
    expect(dropRoleIdx, 'DROP ROLE must come after all policy drops').toBeGreaterThan(
      lastPolicyDropIdx,
    );
  });
});
