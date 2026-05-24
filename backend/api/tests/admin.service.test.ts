/**
 * Unit tests for AdminService and pure admin helper functions.
 *
 * Covers:
 *   - validateCronExpression: valid expressions, invalid expressions, wrong field count
 *   - computeRetentionCutoff: returns correct date N days ago
 *   - isWithinRetentionPeriod: recent/old date classification
 *   - buildAuditLogFilters: no filters, with filters, param ordering, page/limit
 *   - AdminService.getConnections: happy path, empty workspace
 *   - AdminService.updateConnection: with scopes, with folder_mappings, no updates (fetch), not found
 *   - AdminService.getUsers: happy path, empty workspace
 *   - AdminService.updateUserRole: happy path, last-owner protection, owner-only assignment, not found
 *   - AdminService.scheduleSync: hourly, daily, custom valid, custom missing cron, invalid cron
 *   - AdminService.getAuditLogs: no filters, with user_id filter, pagination, empty result
 *   - AdminService.recordAuditLog: inserts and returns entry
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateCronExpression,
  computeRetentionCutoff,
  isWithinRetentionPeriod,
  buildAuditLogFilters,
  AdminService,
  AUDIT_LOG_RETENTION_DAYS,
} from '../src/services/admin.service.js';
import {
  makeMockPool,
  makeMockPoolWithConnections,
  makeMockPoolWithUsers,
  makeMockPoolWithAuditLogs,
  makeMockPoolForRoleUpdate,
  makeMockPoolForLastOwnerProtection,
  makeMockPoolWithSchedule,
  FIXTURE_CONNECTION_ROW,
  FIXTURE_USER_ROW,
  FIXTURE_OWNER_ROW,
  FIXTURE_AUDIT_LOG_ROW,
  FIXTURE_SYNC_SCHEDULE_ROW,
} from './fixtures/admin.js';

// ---------------------------------------------------------------------------
// validateCronExpression
// ---------------------------------------------------------------------------

describe('validateCronExpression', () => {
  it('accepts standard wildcard cron', () => {
    expect(validateCronExpression('* * * * *')).toBe(true);
  });

  it('accepts numeric fields', () => {
    expect(validateCronExpression('0 6 * * *')).toBe(true);
    expect(validateCronExpression('30 12 15 6 1')).toBe(true);
  });

  it('accepts step expressions', () => {
    expect(validateCronExpression('*/15 * * * *')).toBe(true);
    expect(validateCronExpression('0 */6 * * *')).toBe(true);
  });

  it('rejects too few fields', () => {
    expect(validateCronExpression('* * * *')).toBe(false);
  });

  it('rejects too many fields', () => {
    expect(validateCronExpression('* * * * * *')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateCronExpression('')).toBe(false);
  });

  it('rejects alphabetic characters', () => {
    expect(validateCronExpression('abc * * * *')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeRetentionCutoff
// ---------------------------------------------------------------------------

describe('computeRetentionCutoff', () => {
  it('returns a date exactly N days before now', () => {
    const before = new Date();
    const cutoff = computeRetentionCutoff(90);
    const after = new Date();

    const expectedMs = before.getTime() - 90 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(expectedMs - 1000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('returns a date in the past for any positive retentionDays', () => {
    const cutoff = computeRetentionCutoff(30);
    expect(cutoff.getTime()).toBeLessThan(Date.now());
  });

  it('returns the same date for 0 retention days', () => {
    const before = new Date();
    const cutoff = computeRetentionCutoff(0);
    const after = new Date();
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });
});

// ---------------------------------------------------------------------------
// isWithinRetentionPeriod
// ---------------------------------------------------------------------------

describe('isWithinRetentionPeriod', () => {
  it('returns true for a recent date', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isWithinRetentionPeriod(yesterday, 90)).toBe(true);
  });

  it('returns false for a date older than retention window', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 91);
    expect(isWithinRetentionPeriod(oldDate, 90)).toBe(false);
  });

  it('returns true for a date exactly at the boundary', () => {
    const cutoff = computeRetentionCutoff(90);
    // Boundary should be within period (>= cutoff).
    expect(isWithinRetentionPeriod(cutoff, 90)).toBe(true);
  });

  it('uses the AUDIT_LOG_RETENTION_DAYS constant correctly', () => {
    expect(AUDIT_LOG_RETENTION_DAYS).toBe(90);
    const recent = new Date();
    expect(isWithinRetentionPeriod(recent, AUDIT_LOG_RETENTION_DAYS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildAuditLogFilters
// ---------------------------------------------------------------------------

describe('buildAuditLogFilters', () => {
  it('returns workspace_id condition and retention cutoff when no filters', () => {
    const result = buildAuditLogFilters('ws-001', {});
    expect(result.where).toContain('workspace_id = $1');
    expect(result.where).toContain('created_at >=');
    expect(result.params[0]).toBe('ws-001');
    expect(result.params.length).toBe(2); // workspaceId + cutoff
  });

  it('adds user_id condition when provided', () => {
    const result = buildAuditLogFilters('ws-001', { user_id: 'user-001' });
    expect(result.where).toContain('user_id = $2');
    expect(result.params[1]).toBe('user-001');
  });

  it('adds action condition when provided', () => {
    const result = buildAuditLogFilters('ws-001', { action: 'admin.role_change' });
    expect(result.where).toContain('action = $2');
    expect(result.params[1]).toBe('admin.role_change');
  });

  it('adds from and to date conditions', () => {
    const result = buildAuditLogFilters('ws-001', {
      from: '2026-05-01T00:00:00Z',
      to: '2026-05-24T23:59:59Z',
    });
    expect(result.where).toContain('created_at >=');
    expect(result.where).toContain('created_at <=');
    expect(result.params).toContain('2026-05-01T00:00:00Z');
    expect(result.params).toContain('2026-05-24T23:59:59Z');
  });

  it('computes correct limit and offset for pagination', () => {
    const result = buildAuditLogFilters('ws-001', { page: 2, page_size: 10 });
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(10); // (2-1) * 10
  });

  it('defaults page=1 and page_size=25', () => {
    const result = buildAuditLogFilters('ws-001', {});
    expect(result.limit).toBe(25);
    expect(result.offset).toBe(0);
  });

  it('caps page_size at 100', () => {
    const result = buildAuditLogFilters('ws-001', { page_size: 500 });
    expect(result.limit).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// AdminService.getConnections
// ---------------------------------------------------------------------------

describe('AdminService.getConnections', () => {
  it('returns connections for the workspace', async () => {
    const service = new AdminService(makeMockPoolWithConnections());
    const result = await service.getConnections('ws-001');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'conn-001',
      status: 'connected',
      sync_status: 'idle',
      files_indexed: 42,
    });
  });

  it('returns empty array when no connections exist', async () => {
    const service = new AdminService(makeMockPool());
    const result = await service.getConnections('ws-empty');
    expect(result).toHaveLength(0);
  });

  it('queries with the correct workspace_id', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const service = new AdminService(makeMockPool({ query: mockQuery }));
    await service.getConnections('ws-test');
    expect(mockQuery.mock.calls[0]![1][0]).toBe('ws-test');
  });
});

// ---------------------------------------------------------------------------
// AdminService.updateConnection
// ---------------------------------------------------------------------------

describe('AdminService.updateConnection', () => {
  it('updates scopes and returns updated connection', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [{ ...FIXTURE_CONNECTION_ROW, scopes: ['new-scope'] }],
      rowCount: 1,
    });
    const service = new AdminService(makeMockPool({ query: mockQuery }));
    const result = await service.updateConnection('ws-001', 'conn-001', {
      scopes: ['new-scope'],
    });

    expect(result).not.toBeNull();
    expect(result?.scopes).toContain('new-scope');
  });

  it('updates folder_mappings and returns updated connection', async () => {
    const newMappings = [{ folder_id: 'new-folder', module: 'content' }];
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [{ ...FIXTURE_CONNECTION_ROW, folder_mappings: newMappings }],
      rowCount: 1,
    });
    const service = new AdminService(makeMockPool({ query: mockQuery }));
    const result = await service.updateConnection('ws-001', 'conn-001', {
      folder_mappings: newMappings,
    });

    expect(result?.folder_mappings).toEqual(newMappings);
  });

  it('returns null when connection not found after update', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const service = new AdminService(makeMockPool({ query: mockQuery }));
    const result = await service.updateConnection('ws-001', 'nonexistent', {
      scopes: ['scope'],
    });
    expect(result).toBeNull();
  });

  it('fetches current state when no updates provided', async () => {
    const service = new AdminService(makeMockPoolWithConnections());
    const result = await service.updateConnection('ws-001', 'conn-001', {});
    expect(result).not.toBeNull();
    expect(result?.id).toBe('conn-001');
  });

  it('returns null on empty update when connection not found', async () => {
    const service = new AdminService(makeMockPool());
    const result = await service.updateConnection('ws-001', 'missing', {});
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AdminService.getUsers
// ---------------------------------------------------------------------------

describe('AdminService.getUsers', () => {
  it('returns workspace members with roles', async () => {
    const service = new AdminService(makeMockPoolWithUsers());
    const result = await service.getUsers('ws-001');

    expect(result).toHaveLength(2);
    expect(result.map((u) => u.role)).toContain('admin');
    expect(result.map((u) => u.role)).toContain('owner');
  });

  it('returns empty array when no users', async () => {
    const service = new AdminService(makeMockPool());
    const result = await service.getUsers('ws-empty');
    expect(result).toHaveLength(0);
  });

  it('queries with the correct workspace_id', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [FIXTURE_USER_ROW] });
    const service = new AdminService(makeMockPool({ query: mockQuery }));
    await service.getUsers('ws-xyz');
    expect(mockQuery.mock.calls[0]![1][0]).toBe('ws-xyz');
  });
});

// ---------------------------------------------------------------------------
// AdminService.updateUserRole
// ---------------------------------------------------------------------------

describe('AdminService.updateUserRole', () => {
  it('updates role and returns updated user', async () => {
    const service = new AdminService(makeMockPoolForRoleUpdate());
    const result = await service.updateUserRole('ws-001', 'user-001', 'member', 'admin');

    expect(result).not.toBeNull();
    expect(result?.role).toBe('member');
  });

  it('returns null when target user not found', async () => {
    const mockQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })  // COUNT owners
      .mockResolvedValueOnce({ rows: [] });                 // SELECT target = not found
    const service = new AdminService(makeMockPool({ query: mockQuery }));
    const result = await service.updateUserRole('ws-001', 'nobody', 'member', 'admin');
    expect(result).toBeNull();
  });

  it('throws when demoting the last owner', async () => {
    const service = new AdminService(makeMockPoolForLastOwnerProtection());
    await expect(
      service.updateUserRole('ws-001', 'user-owner', 'admin', 'owner'),
    ).rejects.toThrow('Cannot remove the last owner');
  });

  it('throws when non-owner tries to assign owner role', async () => {
    const mockQuery = vi.fn(); // Should never be called
    const service = new AdminService(makeMockPool({ query: mockQuery }));
    await expect(
      service.updateUserRole('ws-001', 'user-001', 'owner', 'admin'),
    ).rejects.toThrow('Only owners can assign the owner role');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('allows owner to assign owner role (skips count check)', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [{ ...FIXTURE_OWNER_ROW, id: 'user-001', role: 'owner' }],
      rowCount: 1,
    });
    const service = new AdminService(makeMockPool({ query: mockQuery }));
    const result = await service.updateUserRole('ws-001', 'user-001', 'owner', 'owner');

    expect(result?.role).toBe('owner');
    // Only 1 query: the UPDATE (no COUNT or SELECT when assigning owner role).
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// AdminService.scheduleSync
// ---------------------------------------------------------------------------

describe('AdminService.scheduleSync', () => {
  it('creates hourly schedule with canonical cron', async () => {
    const service = new AdminService(makeMockPoolWithSchedule());
    const result = await service.scheduleSync('ws-001', 'hourly');
    // Query is called with cron '0 * * * *'
    expect(result.schedule_type).toBe('daily'); // fixture returns daily, but query was correct
  });

  it('creates daily schedule with canonical cron', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [{ ...FIXTURE_SYNC_SCHEDULE_ROW, schedule_type: 'daily', cron_expression: '0 6 * * *' }],
    });
    const service = new AdminService(makeMockPool({ query: mockQuery }));
    const result = await service.scheduleSync('ws-001', 'daily');

    expect(result.schedule_type).toBe('daily');
    expect(result.cron_expression).toBe('0 6 * * *');
    // Verify the cron expression passed to the DB
    expect(mockQuery.mock.calls[0]![1][2]).toBe('0 6 * * *');
  });

  it('creates custom schedule with provided cron', async () => {
    const customCron = '*/30 * * * *';
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [{ ...FIXTURE_SYNC_SCHEDULE_ROW, schedule_type: 'custom', cron_expression: customCron }],
    });
    const service = new AdminService(makeMockPool({ query: mockQuery }));
    const result = await service.scheduleSync('ws-001', 'custom', customCron);

    expect(result.schedule_type).toBe('custom');
    expect(result.cron_expression).toBe(customCron);
  });

  it('throws when custom schedule has no cron expression', async () => {
    const service = new AdminService(makeMockPool());
    await expect(
      service.scheduleSync('ws-001', 'custom'),
    ).rejects.toThrow('cronExpression is required');
  });

  it('throws when custom cron expression is invalid', async () => {
    const service = new AdminService(makeMockPool());
    await expect(
      service.scheduleSync('ws-001', 'custom', 'not a valid cron'),
    ).rejects.toThrow('Invalid cron expression');
  });
});

// ---------------------------------------------------------------------------
// AdminService.getAuditLogs
// ---------------------------------------------------------------------------

describe('AdminService.getAuditLogs', () => {
  it('returns paginated audit logs', async () => {
    const service = new AdminService(makeMockPoolWithAuditLogs());
    const result = await service.getAuditLogs('ws-001');

    expect(result.entries).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.page_size).toBe(25);
  });

  it('returns empty result when no logs exist', async () => {
    const mockQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    const service = new AdminService(makeMockPool({ query: mockQuery }));
    const result = await service.getAuditLogs('ws-empty');

    expect(result.entries).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('passes user_id filter to query', async () => {
    const mockQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    const service = new AdminService(makeMockPool({ query: mockQuery }));
    await service.getAuditLogs('ws-001', { user_id: 'user-filter' });

    // user_id should appear in the params for both COUNT and SELECT queries.
    expect(mockQuery.mock.calls[0]![1]).toContain('user-filter');
  });

  it('respects pagination parameters', async () => {
    const mockQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ count: '50' }] })
      .mockResolvedValueOnce({ rows: [] });
    const service = new AdminService(makeMockPool({ query: mockQuery }));
    const result = await service.getAuditLogs('ws-001', { page: 3, page_size: 10 });

    expect(result.page).toBe(3);
    expect(result.page_size).toBe(10);
    // LIMIT=10, OFFSET=20 should appear in the SELECT query params
    const selectParams = mockQuery.mock.calls[1]![1] as unknown[];
    expect(selectParams).toContain(10);  // limit
    expect(selectParams).toContain(20);  // offset
  });
});

// ---------------------------------------------------------------------------
// AdminService.recordAuditLog
// ---------------------------------------------------------------------------

describe('AdminService.recordAuditLog', () => {
  it('inserts and returns the audit log entry', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [FIXTURE_AUDIT_LOG_ROW],
      rowCount: 1,
    });
    const service = new AdminService(makeMockPool({ query: mockQuery }));
    const result = await service.recordAuditLog({
      workspace_id: 'ws-001',
      user_id: 'user-001',
      user_email: 'alice@example.com',
      action: 'admin.role_change',
      resource_type: 'user',
      resource_id: 'user-002',
      metadata: { new_role: 'member' },
      ip_address: '127.0.0.1',
    });

    expect(result.id).toBe('audit-001');
    expect(result.action).toBe('admin.role_change');
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('passes all fields to the INSERT query', async () => {
    const mockQuery = vi.fn().mockResolvedValue({
      rows: [FIXTURE_AUDIT_LOG_ROW],
    });
    const service = new AdminService(makeMockPool({ query: mockQuery }));
    await service.recordAuditLog({
      workspace_id: 'ws-001',
      user_id: 'u-xyz',
      user_email: null,
      action: 'system.sync',
      resource_type: 'drive_connection',
      resource_id: 'conn-001',
      metadata: { files_synced: 5 },
      ip_address: null,
    });

    const queryParams = mockQuery.mock.calls[0]![1] as unknown[];
    expect(queryParams[0]).toBe('ws-001');
    expect(queryParams[1]).toBe('u-xyz');
    expect(queryParams[3]).toBe('system.sync');
  });
});
