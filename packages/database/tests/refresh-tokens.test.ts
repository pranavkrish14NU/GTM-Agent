/**
 * Unit tests for migration 3: refresh_tokens table
 *
 * Uses the spy-proxy MigrationBuilder pattern to capture every SQL statement
 * emitted by up() and down() without touching a live database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MigrationBuilder } from 'node-pg-migrate';
import { up, down } from '../migrations/3_refresh_tokens.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePgm() {
  const statements: string[] = [];
  const pgm = new Proxy({} as MigrationBuilder, {
    get(_target, prop) {
      if (prop === 'sql') {
        return (sql: string) => {
          statements.push(sql.replace(/\s+/g, ' ').trim());
        };
      }
      return () => {};
    },
  });
  return { pgm, statements };
}

/** Returns true when at least one statement contains ALL of the given substrings. */
function hasSql(statements: string[], ...substrings: string[]): boolean {
  return statements.some((s) =>
    substrings.every((sub) => s.toLowerCase().includes(sub.toLowerCase())),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('migration 3 — refresh_tokens', () => {
  let pgm: MigrationBuilder;
  let statements: string[];

  beforeEach(() => {
    ({ pgm, statements } = makePgm());
  });

  // -------------------------------------------------------------------------
  // up()
  // -------------------------------------------------------------------------

  describe('up()', () => {
    beforeEach(async () => {
      await up(pgm);
    });

    it('creates the refresh_tokens table', () => {
      expect(hasSql(statements, 'CREATE TABLE', 'refresh_tokens')).toBe(true);
    });

    it('defines a uuid primary key with gen_random_uuid()', () => {
      expect(
        hasSql(statements, 'CREATE TABLE', 'refresh_tokens', 'uuid', 'gen_random_uuid()'),
      ).toBe(true);
    });

    it('references users(id) with ON DELETE CASCADE', () => {
      expect(
        hasSql(statements, 'CREATE TABLE', 'refresh_tokens', 'REFERENCES users(id)', 'ON DELETE CASCADE'),
      ).toBe(true);
    });

    it('stores token_hash as a UNIQUE text column', () => {
      expect(
        hasSql(statements, 'CREATE TABLE', 'refresh_tokens', 'token_hash', 'text', 'UNIQUE'),
      ).toBe(true);
    });

    it('creates an index on token_hash', () => {
      expect(
        hasSql(statements, 'CREATE INDEX', 'idx_refresh_tokens_token_hash', 'token_hash'),
      ).toBe(true);
    });

    it('creates an index on user_id', () => {
      expect(
        hasSql(statements, 'CREATE INDEX', 'idx_refresh_tokens_user_id', 'user_id'),
      ).toBe(true);
    });

    it('grants SELECT, INSERT, DELETE to boba_app if role exists', () => {
      expect(
        hasSql(statements, 'GRANT', 'SELECT', 'INSERT', 'DELETE', 'refresh_tokens', 'boba_app'),
      ).toBe(true);
    });

    it('emits at least 4 SQL statements', () => {
      expect(statements.length).toBeGreaterThanOrEqual(4);
    });
  });

  // -------------------------------------------------------------------------
  // down()
  // -------------------------------------------------------------------------

  describe('down()', () => {
    beforeEach(async () => {
      await down(pgm);
    });

    it('revokes privileges from boba_app', () => {
      expect(
        hasSql(statements, 'REVOKE', 'refresh_tokens', 'boba_app'),
      ).toBe(true);
    });

    it('drops the refresh_tokens table', () => {
      expect(hasSql(statements, 'DROP TABLE', 'refresh_tokens')).toBe(true);
    });

    it('uses IF EXISTS guard on DROP TABLE', () => {
      expect(hasSql(statements, 'DROP TABLE IF EXISTS', 'refresh_tokens')).toBe(true);
    });

    it('emits exactly 2 SQL statements', () => {
      expect(statements).toHaveLength(2);
    });
  });
});
