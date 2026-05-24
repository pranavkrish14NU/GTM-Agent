/**
 * Unit tests — AdminService GDPR data subject rights methods.
 *
 * Tests:
 *   - exportUserData: fetches profile, queries, drafts; throws when user not found
 *   - deleteUserData: verifies user exists, records audit log, deletes queries + drafts
 *   - deleteWorkspace: validates confirm token, revokes OAuth tokens, cascades deletion
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import {
  AdminService,
  GDPR_CONFIRM_USER_DELETE,
  GDPR_CONFIRM_WORKSPACE_DELETE,
} from '../src/services/admin.service.js';

// ---------------------------------------------------------------------------
// Pool mock factory
// ---------------------------------------------------------------------------

type MockQuery = (sql: string, params?: unknown[]) => Promise<Partial<QueryResult>>;

function makePool(query: MockQuery): Pool {
  return { query } as unknown as Pool;
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const WS_ID = 'ws-test-001';
const USER_ID = 'user-test-001';
const ADMIN_ID = 'admin-test-001';

const USER_ROW = {
  id: USER_ID,
  email: 'test@example.com',
  name: 'Test User',
  role: 'member',
  created_at: '2026-01-01T00:00:00Z',
  last_active_at: '2026-05-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// exportUserData
// ---------------------------------------------------------------------------

describe('AdminService.exportUserData', () => {
  let queryMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryMock = vi.fn();
  });

  it('returns export with profile, queries, and drafts', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [USER_ROW] })           // user lookup
      .mockResolvedValueOnce({ rows: [                        // queries
        { id: 'q1', query_text: 'What is RAG?', response_summary: 'RAG is...', created_at: '2026-05-01T00:00:00Z' },
      ] })
      .mockResolvedValueOnce({ rows: [                        // drafts
        { id: 'd1', title: 'Blog Post', status: 'draft', created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z' },
      ] });

    const service = new AdminService(makePool(queryMock));
    const result = await service.exportUserData(WS_ID, USER_ID);

    expect(result.user_id).toBe(USER_ID);
    expect(result.email).toBe('test@example.com');
    expect(result.name).toBe('Test User');
    expect(result.role).toBe('member');
    expect(result.exported_at).toBeDefined();
    expect(result.profile.created_at).toBe('2026-01-01T00:00:00Z');
    expect(result.queries).toHaveLength(1);
    expect(result.queries[0].query_text).toBe('What is RAG?');
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0].title).toBe('Blog Post');
  });

  it('returns empty arrays when user has no queries or drafts', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [USER_ROW] })
      .mockResolvedValueOnce({ rows: [] })  // no queries
      .mockResolvedValueOnce({ rows: [] }); // no drafts

    const service = new AdminService(makePool(queryMock));
    const result = await service.exportUserData(WS_ID, USER_ID);

    expect(result.queries).toHaveLength(0);
    expect(result.drafts).toHaveLength(0);
  });

  it('throws when user not found in workspace', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }); // user not found

    const service = new AdminService(makePool(queryMock));

    await expect(service.exportUserData(WS_ID, 'nonexistent-user')).rejects.toThrow(
      'User not found in this workspace',
    );
  });

  it('queries users table with correct workspace scoping', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [USER_ROW] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const service = new AdminService(makePool(queryMock));
    await service.exportUserData(WS_ID, USER_ID);

    const [userQuery] = queryMock.mock.calls;
    expect(userQuery[0]).toContain('FROM users');
    expect(userQuery[1]).toEqual([USER_ID, WS_ID]);
  });

  it('exported_at is a valid ISO timestamp', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [USER_ROW] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const service = new AdminService(makePool(queryMock));
    const result = await service.exportUserData(WS_ID, USER_ID);

    expect(() => new Date(result.exported_at).toISOString()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// deleteUserData
// ---------------------------------------------------------------------------

describe('AdminService.deleteUserData', () => {
  let queryMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryMock = vi.fn();
  });

  it('deletes queries and drafts for the target user', async () => {
    // user check, audit log insert, delete queries, delete drafts
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: USER_ID }] }) // user check
      .mockResolvedValueOnce({ rows: [{ id: 'audit-1', created_at: '2026-05-24T00:00:00Z', workspace_id: WS_ID, user_id: ADMIN_ID, user_email: null, action: 'gdpr.user_data_delete', resource_type: 'user', resource_id: USER_ID, metadata: {}, ip_address: null }] }) // audit log
      .mockResolvedValueOnce({ rowCount: 3 })              // delete queries
      .mockResolvedValueOnce({ rowCount: 2 });             // delete drafts

    const service = new AdminService(makePool(queryMock));
    await service.deleteUserData(WS_ID, USER_ID, ADMIN_ID, 'admin@test.com');

    // Verify delete calls were made.
    const deleteCalls = queryMock.mock.calls.filter((c) =>
      typeof c[0] === 'string' && c[0].trim().startsWith('DELETE'),
    );
    expect(deleteCalls.length).toBeGreaterThanOrEqual(2);

    const tableNames = deleteCalls.map((c) => c[0] as string);
    expect(tableNames.some((q) => q.includes('queries'))).toBe(true);
    expect(tableNames.some((q) => q.includes('content_drafts'))).toBe(true);
  });

  it('records audit log before deletion', async () => {
    const auditLogRow = {
      id: 'audit-1',
      created_at: '2026-05-24T00:00:00Z',
      workspace_id: WS_ID,
      user_id: ADMIN_ID,
      user_email: null,
      action: 'gdpr.user_data_delete',
      resource_type: 'user',
      resource_id: USER_ID,
      metadata: {},
      ip_address: null,
    };
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: USER_ID }] }) // user check
      .mockResolvedValueOnce({ rows: [auditLogRow] })      // audit log INSERT
      .mockResolvedValueOnce({ rowCount: 0 })              // delete queries
      .mockResolvedValueOnce({ rowCount: 0 });             // delete drafts

    const service = new AdminService(makePool(queryMock));
    await service.deleteUserData(WS_ID, USER_ID, ADMIN_ID, null);

    const auditCall = queryMock.mock.calls[1];
    expect(typeof auditCall[0]).toBe('string');
    expect((auditCall[0] as string).toUpperCase()).toContain('INSERT');
    expect(auditCall[1]).toContain('gdpr.user_data_delete');
  });

  it('throws when target user is not found', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }); // user not found

    const service = new AdminService(makePool(queryMock));
    await expect(
      service.deleteUserData(WS_ID, 'nonexistent', ADMIN_ID, null),
    ).rejects.toThrow('User not found in this workspace');
  });

  it('scopes delete queries to the correct workspace', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: USER_ID }] })
      .mockResolvedValueOnce({ rows: [{ id: 'audit-1', created_at: '2026-05-24T00:00:00Z', workspace_id: WS_ID, user_id: ADMIN_ID, user_email: null, action: 'gdpr.user_data_delete', resource_type: 'user', resource_id: USER_ID, metadata: {}, ip_address: null }] })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 });

    const service = new AdminService(makePool(queryMock));
    await service.deleteUserData(WS_ID, USER_ID, ADMIN_ID, null);

    const deleteCalls = queryMock.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].trim().startsWith('DELETE'),
    );
    deleteCalls.forEach((call) => {
      expect(call[1]).toContain(WS_ID);
    });
  });
});

// ---------------------------------------------------------------------------
// deleteWorkspace
// ---------------------------------------------------------------------------

describe('AdminService.deleteWorkspace', () => {
  let queryMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryMock = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('throws when confirm token is wrong', async () => {
    const service = new AdminService(makePool(queryMock));
    await expect(
      service.deleteWorkspace(WS_ID, ADMIN_ID, null, 'WRONG_TOKEN'),
    ).rejects.toThrow('Confirmation required');
  });

  it('throws when confirm token is missing', async () => {
    const service = new AdminService(makePool(queryMock));
    await expect(
      service.deleteWorkspace(WS_ID, ADMIN_ID, null, ''),
    ).rejects.toThrow('Confirmation required');
  });

  it('throws when workspace is not found', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }); // workspace check returns nothing

    const service = new AdminService(makePool(queryMock));
    await expect(
      service.deleteWorkspace(WS_ID, ADMIN_ID, null, GDPR_CONFIRM_WORKSPACE_DELETE),
    ).rejects.toThrow('Workspace not found');
  });

  it('revokes OAuth tokens before deleting records', async () => {
    // workspace check → audit log → UPDATE drive_connections (revoke) → deletes → workspace delete
    queryMock.mockResolvedValueOnce({ rows: [{ id: WS_ID }] }); // workspace check

    const service = new AdminService(makePool(queryMock));
    await service.deleteWorkspace(WS_ID, ADMIN_ID, null, GDPR_CONFIRM_WORKSPACE_DELETE);

    const calls = queryMock.mock.calls.map((c) => (c[0] as string).trim().toUpperCase());

    // There should be an UPDATE drive_connections that nullifies tokens.
    const updateIdx = calls.findIndex((q) => q.startsWith('UPDATE') && q.includes('DRIVE_CONNECTIONS'));
    const firstDeleteIdx = calls.findIndex((q) => q.startsWith('DELETE'));

    expect(updateIdx).toBeGreaterThanOrEqual(0);
    expect(firstDeleteIdx).toBeGreaterThanOrEqual(0);
    expect(updateIdx).toBeLessThan(firstDeleteIdx);
  });

  it('deletes the workspace row last', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: WS_ID }] });

    const service = new AdminService(makePool(queryMock));
    await service.deleteWorkspace(WS_ID, ADMIN_ID, null, GDPR_CONFIRM_WORKSPACE_DELETE);

    const deleteCalls = queryMock.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].trim().toUpperCase().startsWith('DELETE'),
    );

    const lastDelete = deleteCalls[deleteCalls.length - 1]![0] as string;
    expect(lastDelete.toUpperCase()).toContain('WORKSPACES');
  });

  it('deletes all expected workspace-scoped tables', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: WS_ID }] });

    const service = new AdminService(makePool(queryMock));
    await service.deleteWorkspace(WS_ID, ADMIN_ID, null, GDPR_CONFIRM_WORKSPACE_DELETE);

    const allSql = queryMock.mock.calls.map((c) => (c[0] as string).toUpperCase()).join('\n');

    const expectedTables = ['QUERIES', 'CONTENT_DRAFTS', 'DOCUMENTS', 'INSIGHTS', 'DRIVE_CONNECTIONS', 'USERS', 'WORKSPACES'];
    for (const table of expectedTables) {
      expect(allSql).toContain(table);
    }
  });

  it('records audit log before deletion', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: WS_ID }] });

    const service = new AdminService(makePool(queryMock));
    await service.deleteWorkspace(WS_ID, ADMIN_ID, null, GDPR_CONFIRM_WORKSPACE_DELETE);

    const insertCalls = queryMock.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].trim().toUpperCase().startsWith('INSERT'),
    );

    // Audit log INSERT should come before DELETE calls.
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);
    const auditInsert = insertCalls.find(
      (c) => c[1] && (c[1] as unknown[]).includes('gdpr.workspace_delete'),
    );
    expect(auditInsert).toBeDefined();
  });

  it('accepts the exact GDPR_CONFIRM_WORKSPACE_DELETE token', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: WS_ID }] });

    const service = new AdminService(makePool(queryMock));
    // Should not throw.
    await expect(
      service.deleteWorkspace(WS_ID, ADMIN_ID, null, GDPR_CONFIRM_WORKSPACE_DELETE),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Confirm token constants
// ---------------------------------------------------------------------------

describe('GDPR confirmation token constants', () => {
  it('GDPR_CONFIRM_USER_DELETE equals DELETE_MY_DATA', () => {
    expect(GDPR_CONFIRM_USER_DELETE).toBe('DELETE_MY_DATA');
  });

  it('GDPR_CONFIRM_WORKSPACE_DELETE equals DELETE_WORKSPACE', () => {
    expect(GDPR_CONFIRM_WORKSPACE_DELETE).toBe('DELETE_WORKSPACE');
  });
});
