/**
 * Analytics Dashboard page — 📈 Analytics Dashboard
 *
 * Features:
 *   - Workspace health score banner
 *   - 10+ dimension cards: Metric → Meaning → Evidence → Recommendation → Next Action
 *   - Trend indicators: ↑ improving, → stable, ↓ declining
 *   - QBR Export button (POST /v1/analytics/export)
 *   - Loading skeleton, empty state, error banner
 *
 * API: GET  /v1/analytics        (getAnalytics)
 *      POST /v1/analytics/export (exportQbrReport)
 */

import { useState, useEffect, useCallback } from 'react';
import { CardSkeleton, EmptyState } from '../../components/common/index.js';
import { formatRelativeTime } from '../../utils/index.js';
import { getAnalytics, exportQbrReport } from './api.js';
import type { AnalyticsDimension, AnalyticsResult } from './types.js';
import { TREND_ICONS, TREND_COLORS, getScoreTier } from './types.js';
import styles from './Analytics.module.css';

// ---------------------------------------------------------------------------
// DimensionCard
// ---------------------------------------------------------------------------

function DimensionCard({ dim }: { dim: AnalyticsDimension }) {
  const tier = getScoreTier(dim.score);
  const trendIcon = TREND_ICONS[dim.trend];
  const trendColor = TREND_COLORS[dim.trend];

  return (
    <div className={styles.dimensionCard} data-testid="dimension-card">
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleRow}>
          <span className={styles.cardIcon}>{dim.icon}</span>
          <h3 className={styles.cardDimension} data-testid="dimension-name">{dim.dimension}</h3>
        </div>
        <div className={styles.cardMetricRow}>
          <span className={styles.cardScore} data-testid="dimension-score">{dim.score}</span>
          <span
            className={`${styles.trendBadge} ${styles[dim.trend]}`}
            data-testid="dimension-trend"
            style={{ color: trendColor }}
          >
            {trendIcon} {dim.trend}
          </span>
        </div>
      </div>

      <div className={styles.scoreBar}>
        <div
          className={`${styles.scoreBarFill} ${styles[tier]}`}
          style={{ width: `${dim.score}%` }}
        />
      </div>

      <p className={styles.cardMeaning} data-testid="dimension-meaning">{dim.meaning}</p>

      {dim.evidence.length > 0 && (
        <ul className={styles.evidenceList} data-testid="dimension-evidence">
          {dim.evidence.map((point, i) => (
            <li key={i} className={styles.evidenceItem}>{point}</li>
          ))}
        </ul>
      )}

      <div className={styles.cardFooter}>
        <div>
          <p className={styles.footerLabel}>Recommendation</p>
          <p className={styles.footerText} data-testid="dimension-recommendation">{dim.recommendation}</p>
        </div>
        <div>
          <p className={styles.footerLabel}>Next Action</p>
          <p className={styles.footerText} data-testid="dimension-next-action">{dim.next_action}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LoadingSkeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div data-testid="analytics-loading">
      <div className={styles.skeletonGrid}>
        {Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analytics — main page component
// ---------------------------------------------------------------------------

export default function Analytics() {
  const [result, setResult] = useState<AnalyticsResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  useEffect(() => {
    getAnalytics()
      .then((data) => setResult(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load analytics'))
      .finally(() => setIsLoading(false));
  }, []);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportMessage(null);
    try {
      const res = await exportQbrReport();
      setExportMessage(`QBR report ready: ${res.file_name}`);
      // Trigger download in browser
      const link = document.createElement('a');
      link.href = res.download_url;
      link.download = res.file_name;
      link.click();
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, []);

  const hasNoData = !isLoading && !error && (!result || result.dimensions.length === 0);

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle} data-testid="analytics-heading">
            📈 Analytics Dashboard
          </h1>
          <p className={styles.pageSubtitle}>
            10+ GTM dimensions with Metric → Meaning → Evidence → Recommendation → Next Action.
          </p>
        </div>
        <div className={styles.headerActions}>
          {result?.last_analyzed_at && (
            <span className={styles.lastUpdated} data-testid="analytics-last-updated">
              Updated {formatRelativeTime(result.last_analyzed_at)}
            </span>
          )}
          <button
            type="button"
            className={styles.exportButton}
            onClick={() => void handleExport()}
            disabled={isExporting || !result}
            data-testid="export-qbr-button"
          >
            {isExporting ? '⟳ Exporting…' : '⬇ Export QBR'}
          </button>
        </div>
      </div>

      {/* Export message */}
      {exportMessage && (
        <p
          className={styles.exportMessage}
          data-testid="export-message"
          role="status"
        >
          {exportMessage}
        </p>
      )}

      {/* Error */}
      {error && (
        <p className={styles.errorBanner} role="alert" data-testid="analytics-error">
          {error}
        </p>
      )}

      {/* Workspace health score */}
      {!isLoading && result && (
        <div className={styles.healthBanner} data-testid="health-banner">
          <div>
            <p className={styles.healthLabel}>Overall GTM Health Score</p>
            <p className={styles.healthScore} data-testid="workspace-score">
              {result.workspace_score}
            </p>
            <p className={styles.healthSubtext}>across {result.dimensions.length} dimensions</p>
          </div>
          <div className={styles.healthBadge}>
            <p className={styles.healthLabel}>Dimensions Tracked</p>
            <p className={styles.healthScore}>{result.dimensions.length}</p>
          </div>
        </div>
      )}

      {isLoading && <LoadingSkeleton />}

      {hasNoData && (
        <EmptyState
          icon="📈"
          title="No analytics yet"
          description="Connect your CRM and Google Drive, then run an analysis to surface GTM dimension scores."
        />
      )}

      {!isLoading && result && result.dimensions.length > 0 && (
        <div className={styles.dimensionGrid} data-testid="dimension-grid">
          {result.dimensions.map((dim) => (
            <DimensionCard key={dim.id} dim={dim} />
          ))}
        </div>
      )}
    </div>
  );
}
