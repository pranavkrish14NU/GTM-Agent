/**
 * Workspace context middleware — injects PostgreSQL RLS session variable.
 *
 * PostgreSQL RLS policies on BOBA tables filter rows by the value of the
 * session parameter `app.current_workspace_id`.  This middleware:
 *
 *   1. Reads the workspace_id from the already-verified JWT claims (req.user).
 *   2. Attaches it to req.workspaceId for convenience in route handlers.
 *   3. Exposes withWorkspaceContext() — a helper that routes call when they
 *      need a database client with RLS properly scoped.
 *
 * Why withWorkspaceContext() instead of a per-request pool client?
 *   SET LOCAL is scoped to the current transaction.  Acquiring a pool client,
 *   opening a transaction, and calling SET LOCAL guarantees the variable is
 *   in effect for exactly the queries in that transaction — safe with
 *   PgBouncer and connection pooling.
 *
 * Why not just middleware that holds a client for the entire request?
 *   That would hold a connection open for the full request duration including
 *   serialization time, which hurts pool utilization under load.  Routes
 *   instead call withWorkspaceContext() for the minimal duration of their DB
 *   work.
 */

import type { Request, Response, NextFunction } from 'express';
import type { Pool, PoolClient } from 'pg';

// ---------------------------------------------------------------------------
// Express Request augmentation
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** workspace_id from the authenticated JWT, set by workspaceContextMiddleware. */
      workspaceId?: string;
    }
  }
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

/**
 * Creates middleware that populates req.workspaceId from req.user.
 *
 * Attach after createJwtMiddleware() on routes that need workspace context.
 */
export function createWorkspaceContextMiddleware() {
  return function workspaceContextMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void {
    if (req.user?.workspace_id) {
      req.workspaceId = req.user.workspace_id;
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// withWorkspaceContext helper
// ---------------------------------------------------------------------------

/**
 * Runs `fn` with a PostgreSQL client that has RLS scoped to `workspaceId`.
 *
 * Executes within an explicit transaction so SET LOCAL is in effect for all
 * queries `fn` makes.  Commits on success, rolls back on error.
 *
 * @example
 *   const rows = await withWorkspaceContext(pool, req.workspaceId!, async (client) => {
 *     const result = await client.query('SELECT * FROM documents LIMIT 10');
 *     return result.rows;
 *   });
 */
export async function withWorkspaceContext<T>(
  pool: Pool,
  workspaceId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // SET LOCAL scopes to the current transaction — safe with connection pools.
    await client.query('SET LOCAL app.current_workspace_id = $1', [workspaceId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
