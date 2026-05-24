/**
 * Unit tests for DocumentService and computeFreshnessScore.
 *
 * The PostgreSQL pool is mocked — no database calls are made.
 * withWorkspaceContext is exercised via the mock pool that simulates
 * BEGIN / SET LOCAL / query / COMMIT / release.
 *
 * Coverage:
 *   computeFreshnessScore
 *   ✓ returns 0 for null lastSynced
 *   ✓ returns 0 for an invalid date string
 *   ✓ returns 100 when just synced
 *   ✓ returns ~86 for 7 days ago
 *   ✓ returns ~51 for 30 days ago
 *   ✓ returns ~37 for 45 days ago (TAU)
 *   ✓ never returns negative values
 *
 *   DocumentService.listDocuments
 *   ✓ returns paginated documents with freshness scores
 *   ✓ applies page and pageSize correctly (offset calculation)
 *   ✓ returns total count from the second query
 *   ✓ defaults to page=1 pageSize=20 when options omitted
 *
 *   DocumentService.getDuplicates
 *   ✓ groups documents by content_hash
 *   ✓ returns empty array when no duplicates exist
 *
 *   DocumentService.getOutdated
 *   ✓ filters documents below freshness threshold
 *   ✓ includes documents with null last_synced (score=0)
 *   ✓ returns empty array when all documents are fresh
 *
 *   DocumentService.search
 *   ✓ returns empty array for blank query
 *   ✓ returns documents matching the query
 *
 *   DocumentService.getHealth
 *   ✓ returns zeroed metrics when no documents exist
 *   ✓ returns correct counts and average freshness
 */

import { describe, it, expect } from 'vitest';
import {
  computeFreshnessScore,
  DocumentService,
} from '../src/services/document.service.js';
import {
  FIXTURE_DOC_A,
  FIXTURE_DOC_B,
  FIXTURE_DOC_C,
  FIXTURE_DOC_NO_SYNC,
  makeMockClient,
  makeMockPool,
} from './fixtures/documents.js';

const WORKSPACE_ID = 'ws-001';

// ---------------------------------------------------------------------------
// computeFreshnessScore
// ---------------------------------------------------------------------------

describe('computeFreshnessScore', () => {
  it('returns 0 for null lastSynced', () => {
    expect(computeFreshnessScore(null)).toBe(0);
  });

  it('returns 0 for an invalid date string', () => {
    expect(computeFreshnessScore('not-a-date')).toBe(0);
  });

  it('returns 100 when just synced (0 days ago)', () => {
    const now = Date.now();
    const score = computeFreshnessScore(new Date(now).toISOString(), now);
    expect(score).toBe(100);
  });

  it('returns ~86 for 7 days ago', () => {
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const score = computeFreshnessScore(sevenDaysAgo, now);
    expect(score).toBeGreaterThanOrEqual(84);
    expect(score).toBeLessThanOrEqual(88);
  });

  it('returns ~51 for 30 days ago', () => {
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const score = computeFreshnessScore(thirtyDaysAgo, now);
    expect(score).toBeGreaterThanOrEqual(49);
    expect(score).toBeLessThanOrEqual(53);
  });

  it('returns ~37 for 45 days ago (TAU)', () => {
    const now = Date.now();
    const tauDaysAgo = new Date(now - 45 * 24 * 60 * 60 * 1000).toISOString();
    const score = computeFreshnessScore(tauDaysAgo, now);
    expect(score).toBeGreaterThanOrEqual(35);
    expect(score).toBeLessThanOrEqual(39);
  });

  it('never returns a negative value for very old dates', () => {
    const veryOld = new Date(0).toISOString(); // epoch
    expect(computeFreshnessScore(veryOld)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DocumentService.listDocuments
// ---------------------------------------------------------------------------

describe('DocumentService.listDocuments', () => {
  it('returns paginated documents with freshness scores', async () => {
    // listDocuments calls withWorkspaceContext twice (rows + count) via Promise.all
    const rowsClient = makeMockClient([{ rows: [FIXTURE_DOC_A, FIXTURE_DOC_B] }]);
    const countClient = makeMockClient([{ rows: [{ count: '2' }] }]);
    const pool = makeMockPool([rowsClient, countClient]);
    const service = new DocumentService(pool);

    const result = await service.listDocuments(WORKSPACE_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    // Each document should have a freshness_score attached
    expect(typeof result.data[0]!.freshness_score).toBe('number');
  });

  it('clamps pageSize to 100 maximum', async () => {
    const rowsClient = makeMockClient([{ rows: [FIXTURE_DOC_A] }]);
    const countClient = makeMockClient([{ rows: [{ count: '1' }] }]);
    const pool = makeMockPool([rowsClient, countClient]);
    const service = new DocumentService(pool);

    const result = await service.listDocuments(WORKSPACE_ID, { page: 1, pageSize: 500 });
    expect(result.pageSize).toBe(100);
  });

  it('uses page=1 and pageSize=20 when options are omitted', async () => {
    const rowsClient = makeMockClient([{ rows: [] }]);
    const countClient = makeMockClient([{ rows: [{ count: '0' }] }]);
    const pool = makeMockPool([rowsClient, countClient]);
    const service = new DocumentService(pool);

    const result = await service.listDocuments(WORKSPACE_ID);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it('returns total=0 when count query returns no rows', async () => {
    const rowsClient = makeMockClient([{ rows: [] }]);
    const countClient = makeMockClient([{ rows: [] }]);
    const pool = makeMockPool([rowsClient, countClient]);
    const service = new DocumentService(pool);

    const result = await service.listDocuments(WORKSPACE_ID);
    expect(result.total).toBe(0);
  });

  it('attaches freshness_score=0 for documents with null last_synced', async () => {
    const rowsClient = makeMockClient([{ rows: [FIXTURE_DOC_NO_SYNC] }]);
    const countClient = makeMockClient([{ rows: [{ count: '1' }] }]);
    const pool = makeMockPool([rowsClient, countClient]);
    const service = new DocumentService(pool);

    const result = await service.listDocuments(WORKSPACE_ID);
    expect(result.data[0]!.freshness_score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// DocumentService.getDuplicates
// ---------------------------------------------------------------------------

describe('DocumentService.getDuplicates', () => {
  it('groups documents by content_hash', async () => {
    // FIXTURE_DOC_A and FIXTURE_DOC_C share hash-abc123
    const client = makeMockClient([{ rows: [FIXTURE_DOC_A, FIXTURE_DOC_C] }]);
    const pool = makeMockPool([client]);
    const service = new DocumentService(pool);

    const groups = await service.getDuplicates(WORKSPACE_ID);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.content_hash).toBe('hash-abc123');
    expect(groups[0]!.documents).toHaveLength(2);
    expect(groups[0]!.documents[0]!.id).toBe('doc-001');
    expect(groups[0]!.documents[1]!.id).toBe('doc-003');
  });

  it('returns multiple groups when different hashes are duplicated', async () => {
    const docE = { ...FIXTURE_DOC_B, id: 'doc-005', content_hash: 'hash-def456' };
    const client = makeMockClient([
      { rows: [FIXTURE_DOC_A, FIXTURE_DOC_C, FIXTURE_DOC_B, docE] },
    ]);
    const pool = makeMockPool([client]);
    const service = new DocumentService(pool);

    const groups = await service.getDuplicates(WORKSPACE_ID);
    expect(groups).toHaveLength(2);
  });

  it('returns empty array when no duplicates exist', async () => {
    const client = makeMockClient([{ rows: [] }]);
    const pool = makeMockPool([client]);
    const service = new DocumentService(pool);

    const groups = await service.getDuplicates(WORKSPACE_ID);
    expect(groups).toEqual([]);
  });

  it('attaches freshness scores to each document in the group', async () => {
    const client = makeMockClient([{ rows: [FIXTURE_DOC_A, FIXTURE_DOC_C] }]);
    const pool = makeMockPool([client]);
    const service = new DocumentService(pool);

    const groups = await service.getDuplicates(WORKSPACE_ID);
    for (const doc of groups[0]!.documents) {
      expect(typeof doc.freshness_score).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// DocumentService.getOutdated
// ---------------------------------------------------------------------------

describe('DocumentService.getOutdated', () => {
  it('filters documents below the freshness threshold', async () => {
    // FIXTURE_DOC_B was synced 53 days ago (from 2026-05-24, it was 2026-04-01)
    // That should have a score well below 50
    const client = makeMockClient([
      { rows: [FIXTURE_DOC_A, FIXTURE_DOC_B, FIXTURE_DOC_NO_SYNC] },
    ]);
    const pool = makeMockPool([client]);
    const service = new DocumentService(pool);

    // threshold=50 should exclude FIXTURE_DOC_A (recent, score ~100) but include
    // FIXTURE_DOC_B (53 days ago, score ~30) and FIXTURE_DOC_NO_SYNC (score 0)
    const outdated = await service.getOutdated(WORKSPACE_ID, 50);
    const ids = outdated.map((d) => d.id);
    expect(ids).not.toContain('doc-001'); // recent, score ~100
    expect(ids).toContain('doc-002'); // old sync
    expect(ids).toContain('doc-004'); // never synced
  });

  it('includes documents with null last_synced (score=0)', async () => {
    const client = makeMockClient([{ rows: [FIXTURE_DOC_NO_SYNC] }]);
    const pool = makeMockPool([client]);
    const service = new DocumentService(pool);

    const outdated = await service.getOutdated(WORKSPACE_ID, 30);
    expect(outdated).toHaveLength(1);
    expect(outdated[0]!.freshness_score).toBe(0);
  });

  it('returns empty array when all documents exceed the threshold', async () => {
    const client = makeMockClient([{ rows: [FIXTURE_DOC_A] }]);
    const pool = makeMockPool([client]);
    const service = new DocumentService(pool);

    // threshold=1 — FIXTURE_DOC_A was just synced, score ~100
    const outdated = await service.getOutdated(WORKSPACE_ID, 1);
    expect(outdated).toHaveLength(0);
  });

  it('uses default threshold of 30', async () => {
    const client = makeMockClient([{ rows: [FIXTURE_DOC_NO_SYNC] }]);
    const pool = makeMockPool([client]);
    const service = new DocumentService(pool);

    // Default threshold is 30; never-synced doc has score 0 so it's included
    const outdated = await service.getOutdated(WORKSPACE_ID);
    expect(outdated).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// DocumentService.search
// ---------------------------------------------------------------------------

describe('DocumentService.search', () => {
  it('returns empty array for an empty query', async () => {
    const client = makeMockClient([]);
    const pool = makeMockPool([client]);
    const service = new DocumentService(pool);

    const results = await service.search(WORKSPACE_ID, '   ');
    expect(results).toEqual([]);
    // pool.connect should NOT have been called — early return
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('returns documents matching the query', async () => {
    const client = makeMockClient([{ rows: [FIXTURE_DOC_A] }]);
    const pool = makeMockPool([client]);
    const service = new DocumentService(pool);

    const results = await service.search(WORKSPACE_ID, 'brand');
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('doc-001');
    expect(typeof results[0]!.freshness_score).toBe('number');
  });

  it('returns empty array when no documents match', async () => {
    const client = makeMockClient([{ rows: [] }]);
    const pool = makeMockPool([client]);
    const service = new DocumentService(pool);

    const results = await service.search(WORKSPACE_ID, 'zzznomatch');
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DocumentService.getHealth
// ---------------------------------------------------------------------------

describe('DocumentService.getHealth', () => {
  it('returns zeroed metrics when no documents exist', async () => {
    const client = makeMockClient([{ rows: [] }]);
    const pool = makeMockPool([client]);
    const service = new DocumentService(pool);

    const health = await service.getHealth(WORKSPACE_ID);
    expect(health).toEqual({
      total_files: 0,
      synced_files: 0,
      average_freshness: 0,
      error_count: 0,
    });
  });

  it('returns correct counts and computes average freshness', async () => {
    const syncedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const client = makeMockClient([
      {
        rows: [
          {
            total_files: '3',
            synced_files: '2',
            error_count: '1',
            last_synced_values: [syncedAt, syncedAt],
          },
        ],
      },
    ]);
    const pool = makeMockPool([client]);
    const service = new DocumentService(pool);

    const health = await service.getHealth(WORKSPACE_ID);
    expect(health.total_files).toBe(3);
    expect(health.synced_files).toBe(2);
    expect(health.error_count).toBe(1);
    // 5-day-old docs should have freshness ~90
    expect(health.average_freshness).toBeGreaterThan(85);
    expect(health.average_freshness).toBeLessThanOrEqual(100);
  });

  it('returns average_freshness=0 when no documents have been synced', async () => {
    const client = makeMockClient([
      {
        rows: [
          {
            total_files: '2',
            synced_files: '0',
            error_count: '2',
            last_synced_values: null,
          },
        ],
      },
    ]);
    const pool = makeMockPool([client]);
    const service = new DocumentService(pool);

    const health = await service.getHealth(WORKSPACE_ID);
    expect(health.average_freshness).toBe(0);
  });
});
