/**
 * Unit tests for workspace context middleware and withWorkspaceContext helper.
 *
 * Coverage:
 *   ✓ createWorkspaceContextMiddleware — sets req.workspaceId from req.user
 *   ✓ createWorkspaceContextMiddleware — skips when req.user is absent
 *   ✓ withWorkspaceContext — runs fn with SET LOCAL in a transaction
 *   ✓ withWorkspaceContext — commits on success
 *   ✓ withWorkspaceContext — rolls back and rethrows on fn error
 *   ✓ withWorkspaceContext — always releases the client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  createWorkspaceContextMiddleware,
  withWorkspaceContext,
} from '../src/middleware/workspace.middleware.js';
import { OWNER_USER, WORKSPACE_ID } from './fixtures/rbac.js';
import type { Pool, PoolClient } from 'pg';

// ---------------------------------------------------------------------------
// Mock pool factory
// ---------------------------------------------------------------------------

function makeMockClient(queryResponses: unknown[] = []) {
  let callIndex = 0;
  const query = vi.fn().mockImplementation(() => {
    const resp = queryResponses[callIndex] ?? { rows: [], rowCount: 0 };
    callIndex++;
    return Promise.resolve(resp);
  });
  const release = vi.fn();
  return { query, release } as unknown as PoolClient & {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
}

function makeMockPool(client: PoolClient) {
  return {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;
}

// ---------------------------------------------------------------------------
// createWorkspaceContextMiddleware
// ---------------------------------------------------------------------------

describe('createWorkspaceContextMiddleware', () => {
  it('sets req.workspaceId from req.user.workspace_id', () => {
    const next = vi.fn() as NextFunction;
    const req = { user: OWNER_USER } as unknown as Request;
    const res = {} as Response;

    createWorkspaceContextMiddleware()(req, res, next);

    expect((req as Request & { workspaceId: string }).workspaceId).toBe(WORKSPACE_ID);
    expect(next).toHaveBeenCalledOnce();
  });

  it('skips when req.user is absent', () => {
    const next = vi.fn() as NextFunction;
    const req = {} as Request;
    const res = {} as Response;

    createWorkspaceContextMiddleware()(req, res, next);

    expect((req as Request & { workspaceId?: string }).workspaceId).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('skips when req.user has no workspace_id', () => {
    const next = vi.fn() as NextFunction;
    const req = { user: { user_id: 'u1', workspace_id: '', role: 'member', email: 'x@x.com' } } as unknown as Request;
    const res = {} as Response;

    createWorkspaceContextMiddleware()(req, res, next);

    expect((req as Request & { workspaceId?: string }).workspaceId).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// withWorkspaceContext
// ---------------------------------------------------------------------------

describe('withWorkspaceContext', () => {
  let client: ReturnType<typeof makeMockClient>;
  let pool: Pool;

  beforeEach(() => {
    client = makeMockClient([
      { rows: [], rowCount: 0 }, // BEGIN
      { rows: [], rowCount: 0 }, // SET LOCAL
      { rows: [{ id: 'row-1' }], rowCount: 1 }, // fn query
      { rows: [], rowCount: 0 }, // COMMIT
    ]);
    pool = makeMockPool(client);
  });

  it('executes BEGIN, SET LOCAL, COMMIT in order', async () => {
    await withWorkspaceContext(pool, WORKSPACE_ID, async (c) => {
      await c.query('SELECT 1');
      return [];
    });

    const calls = (client.query as ReturnType<typeof vi.fn>).mock.calls as string[][];
    expect(calls[0]?.[0]).toBe('BEGIN');
    expect(calls[1]?.[0]).toBe("SELECT set_config('app.current_workspace_id', $1, true)");
    expect(calls[1]?.[1]).toEqual([WORKSPACE_ID]);
    expect(calls[3]?.[0]).toBe('COMMIT');
  });

  it('returns the value from fn', async () => {
    const result = await withWorkspaceContext(pool, WORKSPACE_ID, async () => 'test-value');
    expect(result).toBe('test-value');
  });

  it('releases client on success', async () => {
    await withWorkspaceContext(pool, WORKSPACE_ID, async () => null);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back and rethrows on fn error', async () => {
    const rollbackClient = makeMockClient([
      { rows: [], rowCount: 0 }, // BEGIN
      { rows: [], rowCount: 0 }, // SET LOCAL
      // fn throws before any query
      { rows: [], rowCount: 0 }, // ROLLBACK
    ]);
    const rollbackPool = makeMockPool(rollbackClient);

    await expect(
      withWorkspaceContext(rollbackPool, WORKSPACE_ID, async () => {
        throw new Error('fn failed');
      }),
    ).rejects.toThrow('fn failed');

    const calls = (rollbackClient.query as ReturnType<typeof vi.fn>).mock.calls as string[][];
    expect(calls[2]?.[0]).toBe('ROLLBACK');
  });

  it('releases client even after fn error', async () => {
    const errorClient = makeMockClient([
      { rows: [], rowCount: 0 }, // BEGIN
      { rows: [], rowCount: 0 }, // SET LOCAL
      { rows: [], rowCount: 0 }, // ROLLBACK
    ]);
    const errorPool = makeMockPool(errorClient);

    await expect(
      withWorkspaceContext(errorPool, WORKSPACE_ID, async () => {
        throw new Error('oops');
      }),
    ).rejects.toThrow();

    expect(errorClient.release).toHaveBeenCalledOnce();
  });
});
