/**
 * Migration 004: Add sync metadata and folder mappings to drive_connections.
 *
 * The original drive_connections table (migration 001) stores OAuth tokens but
 * has no way to track sync progress or folder-to-module configuration.  This
 * migration adds five columns needed by the Drive Connection API (WO-019):
 *
 *   folder_mappings  — JSONB array of { folder_id, folder_name, module } objects.
 *                      Defaults to empty object (no folders configured).
 *   sync_status      — Current sync lifecycle state.
 *                      Values: 'never' | 'idle' | 'syncing' | 'error'
 *                      Defaults to 'never' so existing rows start in the
 *                      unsynced state.
 *   files_indexed    — Count of files successfully chunked + embedded in the
 *                      most recent sync run.
 *   last_sync_at     — Timestamp of the last successful sync completion.
 *                      NULL until the first sync runs.
 *   sync_health      — Aggregate health indicator computed after each sync.
 *                      Values: 'healthy' | 'degraded' | 'error' | NULL
 *                      NULL until the first sync completes.
 *
 * Rollback (down) removes all five columns.
 */

import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('drive_connections', {
    folder_mappings: {
      type: 'jsonb',
      notNull: true,
      default: "'{}'::jsonb",
    },
    sync_status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'never'",
    },
    files_indexed: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    last_sync_at: {
      type: 'timestamptz',
    },
    sync_health: {
      type: 'varchar(20)',
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns('drive_connections', [
    'folder_mappings',
    'sync_status',
    'files_indexed',
    'last_sync_at',
    'sync_health',
  ]);
}
