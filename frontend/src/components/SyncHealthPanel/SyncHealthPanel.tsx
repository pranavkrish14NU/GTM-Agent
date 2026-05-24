/**
 * SyncHealthPanel — shows Drive sync status, last sync time, freshness
 * distribution, and total file count. Supports tri-state async rendering.
 */

import type { SyncHealthData, DriveConnectionStatus } from '../../types/index.js';
import type { AsyncState } from '../../types/index.js';
import { CardSkeleton, EmptyState, ErrorState } from '../common/index.js';
import { formatRelativeTime } from '../../utils/index.js';
import styles from './SyncHealthPanel.module.css';

export interface SyncHealthPanelProps {
  state: AsyncState<SyncHealthData>;
  onRetry?: () => void;
  /** Callback triggered when the user wants to reconnect Drive */
  onReconnect?: () => void;
}

const STATUS_LABEL: Record<DriveConnectionStatus, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  syncing: 'Syncing…',
  error: 'Error',
};

const STATUS_DOT: Record<DriveConnectionStatus, string> = {
  connected: styles.dotGreen,
  disconnected: styles.dotGray,
  syncing: styles.dotAmber,
  error: styles.dotRed,
};

export function SyncHealthPanel({ state, onRetry, onReconnect }: SyncHealthPanelProps) {
  const { data, status, error } = state;

  if (status === 'loading') {
    return <CardSkeleton />;
  }

  if (status === 'error') {
    return (
      <ErrorState
        message={error ?? 'Failed to load sync health.'}
        onRetry={onRetry}
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="Drive not connected"
        description="Connect your Google Drive to start indexing documents."
        icon="📁"
        action={onReconnect ? { label: 'Connect Drive', onClick: onReconnect } : undefined}
      />
    );
  }

  const { connection, freshnessDistribution, totalFiles } = data;
  const { fresh, stale, outdated } = freshnessDistribution;

  // Percentage bars — guard against zero totalFiles
  const freshPct = totalFiles > 0 ? Math.round((fresh / totalFiles) * 100) : 0;
  const stalePct = totalFiles > 0 ? Math.round((stale / totalFiles) * 100) : 0;
  const outdatedPct = totalFiles > 0 ? Math.round((outdated / totalFiles) * 100) : 0;

  return (
    <section className={styles.panel} data-testid="sync-health-panel">
      {/* Status row */}
      <div className={styles.statusRow}>
        <span
          className={`${styles.dot} ${STATUS_DOT[connection.status]}`}
          aria-hidden="true"
        />
        <span className={styles.statusLabel} data-testid="sync-status">
          {STATUS_LABEL[connection.status]}
        </span>
        <span className={styles.email}>{connection.email}</span>
      </div>

      {/* Last synced */}
      {connection.lastSyncedAt && (
        <p className={styles.lastSynced} data-testid="last-synced">
          Last synced {formatRelativeTime(connection.lastSyncedAt)}
        </p>
      )}

      {/* Freshness distribution */}
      <div className={styles.freshnessSection}>
        <h4 className={styles.sectionTitle}>Document freshness</h4>

        {/* Stacked bar */}
        <div className={styles.stackedBar} role="img" aria-label="Freshness distribution bar">
          {freshPct > 0 && (
            <span
              className={`${styles.stackSegment} ${styles.segGreen}`}
              style={{ width: `${freshPct}%` }}
              data-testid="freshness-fresh-bar"
            />
          )}
          {stalePct > 0 && (
            <span
              className={`${styles.stackSegment} ${styles.segAmber}`}
              style={{ width: `${stalePct}%` }}
              data-testid="freshness-stale-bar"
            />
          )}
          {outdatedPct > 0 && (
            <span
              className={`${styles.stackSegment} ${styles.segRed}`}
              style={{ width: `${outdatedPct}%` }}
              data-testid="freshness-outdated-bar"
            />
          )}
        </div>

        {/* Legend */}
        <ul className={styles.legend}>
          <li className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.segGreen}`} />
            <span>Fresh ({fresh})</span>
          </li>
          <li className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.segAmber}`} />
            <span>Stale ({stale})</span>
          </li>
          <li className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.segRed}`} />
            <span>Outdated ({outdated})</span>
          </li>
        </ul>
      </div>

      {/* Total files */}
      <p className={styles.totalFiles} data-testid="total-files">
        <strong>{totalFiles}</strong> files indexed
      </p>

      {/* Reconnect CTA — shown only on error or disconnect */}
      {(connection.status === 'error' || connection.status === 'disconnected') && onReconnect && (
        <button
          className={styles.reconnectButton}
          onClick={onReconnect}
          type="button"
          data-testid="reconnect-button"
        >
          Reconnect Drive
        </button>
      )}
    </section>
  );
}
