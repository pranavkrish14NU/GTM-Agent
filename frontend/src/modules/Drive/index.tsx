/**
 * Drive Knowledge Hub — module page.
 *
 * Shows sync health metrics, a debounced search bar, and three tabs:
 *   All Files  — paginated list sorted by last_synced
 *   Duplicates — files grouped by matching content_hash
 *   Outdated   — files with freshness score < threshold
 *
 * All API calls hit /v1/documents/* (implemented in WO-028).
 * Loading / Empty / Error states are shown for every view.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { EmptyState, ErrorState, SkeletonLoader } from '../../components/common/index.js';
import { formatRelativeTime, debounce } from '../../utils/index.js';
import {
  fetchDocuments,
  fetchDuplicates,
  fetchOutdated,
  fetchSearch,
  fetchHealth,
} from './api.js';
import type {
  DocumentRow,
  DuplicateGroup,
  HealthMetrics,
  ListDocumentsResult,
  ActiveTab,
} from './types.js';
import styles from './Drive.module.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMimeIcon(mimeType: string): string {
  if (mimeType.includes('spreadsheet')) return '📊';
  if (mimeType.includes('presentation')) return '📺';
  if (mimeType.includes('document')) return '📄';
  if (mimeType.includes('pdf')) return '📕';
  if (mimeType.includes('image')) return '🖼️';
  return '📎';
}

function getFreshnessStyle(score: number): { backgroundColor: string; color: string } {
  if (score >= 80) return { backgroundColor: '#d1fae5', color: '#065f46' };
  if (score >= 40) return { backgroundColor: '#fef3c7', color: '#92400e' };
  return { backgroundColor: '#fee2e2', color: '#991b1b' };
}

function getFreshnessLabel(score: number): string {
  if (score >= 80) return 'Fresh';
  if (score >= 40) return 'Stale';
  return 'Outdated';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FreshnessBadgeProps {
  score: number;
}

function FreshnessBadge({ score }: FreshnessBadgeProps) {
  const style = getFreshnessStyle(score);
  const label = getFreshnessLabel(score);
  return (
    <span
      className={styles.freshnessBadge}
      style={style}
      data-testid="freshness-badge"
      data-score={score}
    >
      {score} · {label}
    </span>
  );
}

interface FileRowProps {
  doc: DocumentRow;
  action?: React.ReactNode;
}

function FileRowItem({ doc, action }: FileRowProps) {
  return (
    <li className={styles.fileRow} data-testid="file-row">
      <span className={styles.fileIcon} aria-hidden="true">
        {getMimeIcon(doc.mime_type)}
      </span>
      <div className={styles.fileInfo}>
        <p className={styles.fileName} title={doc.title}>
          {doc.title}
        </p>
        <p className={styles.fileMeta}>
          {doc.last_synced
            ? `Synced ${formatRelativeTime(doc.last_synced)}`
            : 'Never synced'}
        </p>
      </div>
      <div className={styles.fileRight}>
        <FreshnessBadge score={doc.freshness_score} />
        {action}
      </div>
    </li>
  );
}

/** Skeleton row for loading state — matches FileRowItem height */
function FileRowSkeleton() {
  return (
    <li className={styles.skeletonRow} aria-hidden="true" data-testid="skeleton-row">
      <span className={styles.skeletonIcon} />
      <div className={styles.fileInfo} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <SkeletonLoader height="0.875rem" width="55%" />
        <SkeletonLoader height="0.75rem" width="30%" />
      </div>
      <SkeletonLoader height="1.5rem" width="5.5rem" borderRadius="9999px" />
    </li>
  );
}

// ---------------------------------------------------------------------------
// HealthSummary
// ---------------------------------------------------------------------------

interface HealthSummaryProps {
  metrics: HealthMetrics | null;
  loading: boolean;
}

function HealthSummary({ metrics, loading }: HealthSummaryProps) {
  if (loading) {
    return (
      <div className={styles.healthBar} data-testid="health-bar-loading">
        <SkeletonLoader width="6rem" height="2rem" />
        <SkeletonLoader width="6rem" height="2rem" />
        <SkeletonLoader width="6rem" height="2rem" />
        <SkeletonLoader width="6rem" height="2rem" />
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className={styles.healthBar} data-testid="health-bar">
      <div className={styles.healthMetric}>
        <span className={styles.healthValue}>{metrics.total_files}</span>
        <span className={styles.healthLabel}>Total Files</span>
      </div>
      <div className={styles.healthMetric}>
        <span className={styles.healthValue}>{metrics.synced_files}</span>
        <span className={styles.healthLabel}>Synced</span>
      </div>
      <div className={styles.healthMetric}>
        <span
          className={`${styles.healthValue} ${
            metrics.average_freshness >= 60 ? styles.healthValueGood : styles.healthValueBad
          }`}
        >
          {metrics.average_freshness}
        </span>
        <span className={styles.healthLabel}>Avg Freshness</span>
      </div>
      <div className={styles.healthMetric}>
        <span
          className={`${styles.healthValue} ${
            metrics.error_count > 0 ? styles.healthValueBad : styles.healthValueGood
          }`}
        >
          {metrics.error_count}
        </span>
        <span className={styles.healthLabel}>Errors</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AllFilesView
// ---------------------------------------------------------------------------

interface AllFilesViewProps {
  searchQuery: string;
}

function AllFilesView({ searchQuery }: AllFilesViewProps) {
  const [result, setResult] = useState<ListDocumentsResult | null>(null);
  const [searchResults, setSearchResults] = useState<DocumentRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Debounced search callback
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce(async (q: string) => {
      if (!q.trim()) {
        setSearchResults(null);
        return;
      }
      try {
        const docs = await fetchSearch(q);
        setSearchResults(docs);
      } catch {
        // Search errors are non-fatal; fall back to full list
        setSearchResults(null);
      }
    }, 500),
    [],
  );

  // Run search whenever query changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
    } else {
      debouncedSearch(searchQuery);
    }
  }, [searchQuery, debouncedSearch]);

  // Fetch paginated list
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchDocuments(page, PAGE_SIZE)
      .then(setResult)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load documents');
      })
      .finally(() => setLoading(false));
  }, [page]);

  if (loading) {
    return (
      <ul className={styles.fileList} data-testid="file-list-loading">
        {Array.from({ length: 5 }).map((_, i) => (
          <FileRowSkeleton key={i} />
        ))}
      </ul>
    );
  }

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setPage(1);
          setLoading(true);
          setError(null);
          fetchDocuments(1, PAGE_SIZE)
            .then(setResult)
            .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Error'))
            .finally(() => setLoading(false));
        }}
      />
    );
  }

  // Show search results if active
  const displayDocs = searchQuery.trim() ? (searchResults ?? []) : (result?.data ?? []);

  if (displayDocs.length === 0) {
    return (
      <EmptyState
        icon="📁"
        title={
          searchQuery.trim()
            ? 'No files match your search.'
            : 'No files indexed yet. Connect your Google Drive to get started.'
        }
        description={
          searchQuery.trim()
            ? 'Try a different search term.'
            : undefined
        }
      />
    );
  }

  const total = result?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <ul className={styles.fileList} data-testid="file-list">
        {displayDocs.map((doc) => (
          <FileRowItem key={doc.id} doc={doc} />
        ))}
      </ul>

      {/* Pagination — only for non-search view */}
      {!searchQuery.trim() && totalPages > 1 && (
        <div className={styles.pagination} data-testid="pagination">
          <button
            className={styles.pageButton}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            data-testid="prev-page"
          >
            ← Prev
          </button>
          <span className={styles.pageInfo}>
            Page {page} of {totalPages}
          </span>
          <button
            className={styles.pageButton}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            data-testid="next-page"
          >
            Next →
          </button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// DuplicatesView
// ---------------------------------------------------------------------------

function DuplicatesView() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchDuplicates()
      .then(setGroups)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load duplicates');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <ul className={styles.fileList} data-testid="duplicates-loading">
        {Array.from({ length: 3 }).map((_, i) => (
          <FileRowSkeleton key={i} />
        ))}
      </ul>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        icon="✅"
        title="No duplicate files found."
        description="All indexed documents have unique content."
      />
    );
  }

  return (
    <div data-testid="duplicates-list">
      {groups.map((group) => (
        <div
          key={group.content_hash}
          className={styles.duplicateGroup}
          data-testid="duplicate-group"
        >
          <div className={styles.duplicateHeader}>
            <span className={styles.duplicateHashLabel}>
              {group.content_hash.slice(0, 16)}…
            </span>
            <span className={styles.duplicateCount}>
              {group.documents.length} identical files
            </span>
            <button
              className={styles.reviewButton}
              type="button"
              data-testid="review-button"
              onClick={() => {
                // Review action — opens a drawer or detail panel in a future WO
              }}
            >
              Review
            </button>
          </div>
          <ul className={styles.duplicateFiles}>
            {group.documents.map((doc) => (
              <li
                key={doc.id}
                className={styles.duplicateFileItem}
                data-testid="duplicate-file-item"
              >
                <span className={styles.fileIcon} aria-hidden="true">
                  {getMimeIcon(doc.mime_type)}
                </span>
                <div className={styles.fileInfo}>
                  <p className={styles.fileName}>{doc.title}</p>
                  <p className={styles.fileMeta}>
                    {doc.last_synced ? formatRelativeTime(doc.last_synced) : 'Never synced'}
                  </p>
                </div>
                <FreshnessBadge score={doc.freshness_score} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OutdatedView
// ---------------------------------------------------------------------------

const OUTDATED_THRESHOLD = 30;

function OutdatedView() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track which docs have had "Request Update" clicked
  const [requested, setRequested] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchOutdated(OUTDATED_THRESHOLD)
      .then(setDocs)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load outdated documents');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <ul className={styles.fileList} data-testid="outdated-loading">
        {Array.from({ length: 3 }).map((_, i) => (
          <FileRowSkeleton key={i} />
        ))}
      </ul>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  if (docs.length === 0) {
    return (
      <EmptyState
        icon="✅"
        title="All files are up to date."
        description="No documents have a freshness score below 30."
      />
    );
  }

  return (
    <ul className={styles.fileList} data-testid="outdated-list">
      {docs.map((doc) => (
        <FileRowItem
          key={doc.id}
          doc={doc}
          action={
            <button
              className={styles.requestUpdateButton}
              type="button"
              data-testid="request-update-button"
              disabled={requested.has(doc.id)}
              onClick={() =>
                setRequested((prev) => new Set([...prev, doc.id]))
              }
            >
              {requested.has(doc.id) ? 'Requested' : 'Request Update'}
            </button>
          }
        />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// DriveModule — root component
// ---------------------------------------------------------------------------

export default function DriveModule() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [health, setHealth] = useState<HealthMetrics | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [dupeCount, setDupeCount] = useState<number | null>(null);
  const [outdatedCount, setOutdatedCount] = useState<number | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch health on mount
  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => { /* Non-fatal — health bar just stays empty */ })
      .finally(() => setHealthLoading(false));
  }, []);

  // Pre-fetch counts for tab badges
  useEffect(() => {
    fetchDuplicates()
      .then((groups) => setDupeCount(groups.length))
      .catch(() => { /* ignore */ });

    fetchOutdated(OUTDATED_THRESHOLD)
      .then((docs) => setOutdatedCount(docs.length))
      .catch(() => { /* ignore */ });
  }, []);

  return (
    <div className={styles.page} data-testid="drive-module">
      {/* Page header */}
      <header className={styles.header}>
        <h1 className={styles.heading}>Drive Knowledge Hub</h1>
        <p className={styles.subheading}>
          Indexed files, sync health, freshness scores, and duplicate detection.
        </p>
      </header>

      {/* Health summary */}
      <HealthSummary metrics={health} loading={healthLoading} />

      {/* Search bar */}
      <div className={styles.searchRow}>
        <input
          ref={searchInputRef}
          className={styles.searchInput}
          type="search"
          placeholder="Search files by name or content…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search files"
          data-testid="search-input"
        />
      </div>

      {/* Tabs */}
      <nav className={styles.tabs} role="tablist" aria-label="Knowledge Hub views">
        {(
          [
            { id: 'all', label: 'All Files' },
            { id: 'duplicates', label: 'Duplicates', count: dupeCount },
            { id: 'outdated', label: 'Outdated', count: outdatedCount },
          ] as { id: ActiveTab; label: string; count?: number | null }[]
        ).map(({ id, label, count }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            className={`${styles.tab} ${activeTab === id ? styles.tabActive : ''}`}
            onClick={() => {
              setActiveTab(id);
              // Clear search when switching away from All Files
              if (id !== 'all') setSearchQuery('');
            }}
            data-testid={`tab-${id}`}
          >
            {label}
            {count !== null && count !== undefined && (
              <span
                className={`${styles.tabBadge} ${activeTab === id ? styles.tabBadgeActive : ''}`}
                data-testid={`tab-badge-${id}`}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      {activeTab === 'all' && <AllFilesView searchQuery={searchQuery} />}
      {activeTab === 'duplicates' && <DuplicatesView />}
      {activeTab === 'outdated' && <OutdatedView />}
    </div>
  );
}
