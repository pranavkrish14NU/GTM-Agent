/**
 * GTM Command Center Dashboard.
 *
 * Features:
 *   - Overall GTM health score displayed as an SVG ring gauge (0-100)
 *   - 10 dimension cards colour-coded by score (green ≥70 / yellow 40-69 / red <40)
 *   - Metric → Meaning → Evidence → Recommendation → Next Action storytelling format
 *   - Priority recommendations (top 5 lowest-scoring dimensions) with module deep-links
 *   - Last-updated timestamp and on-demand refresh button
 *   - Loading skeleton, empty-state onboarding, and error banner
 *
 * API: GET /v1/dashboard  (getDashboard)
 *      POST /v1/dashboard/refresh  (refreshDashboard)
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { SkeletonLoader, CardSkeleton, EmptyState, ConfidenceBadge } from '../../components/common/index.js';
import { formatRelativeTime } from '../../utils/index.js';
import { getDashboard, refreshDashboard } from './api.js';
import type { DashboardResult, DimensionInsight } from './types.js';
import { getScoreTier } from './types.js';
import styles from './Dashboard.module.css';

// ---------------------------------------------------------------------------
// Dimension → module path mapping
// ---------------------------------------------------------------------------

const DIMENSION_MODULE_PATH: Record<string, string> = {
  brand_consistency: '/brand',
  competitor_coverage: '/competitors',
  persona_completeness: '/personas',
  content_freshness: '/content',
  messaging_alignment: '/brand',
  win_rate_patterns: '/win-loss',
  campaign_coverage: '/campaigns',
  market_awareness: '/analytics',
  sales_enablement_readiness: '/content',
  content_gap_coverage: '/content',
};

// ---------------------------------------------------------------------------
// HealthScoreRing — SVG doughnut gauge
// ---------------------------------------------------------------------------

interface HealthScoreRingProps {
  score: number;
}

function HealthScoreRing({ score }: HealthScoreRingProps) {
  const R = 45;
  const circumference = 2 * Math.PI * R;
  const filled = (Math.min(100, Math.max(0, score)) / 100) * circumference;
  const tier = getScoreTier(score);

  return (
    <div className={styles.scoreRingWrap} data-testid="health-score-ring">
      <svg className={styles.scoreRing} viewBox="0 0 100 100" aria-hidden="true">
        <circle
          className={styles.scoreRingTrack}
          cx="50"
          cy="50"
          r={R}
        />
        <circle
          className={`${styles.scoreRingFill} ${styles[tier]}`}
          cx="50"
          cy="50"
          r={R}
          strokeDasharray={`${filled.toFixed(2)} ${circumference.toFixed(2)}`}
        />
      </svg>
      <div className={styles.scoreLabel} aria-label={`Overall health score: ${score} out of 100`}>
        <span className={styles.scoreValue} data-testid="health-score-value">{score}</span>
        <span className={styles.scoreUnit}>/100</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DimensionCard — one GTM dimension with Metric→Meaning format
// ---------------------------------------------------------------------------

interface DimensionCardProps {
  dimension: DimensionInsight;
}

function DimensionCard({ dimension }: DimensionCardProps) {
  const tier = getScoreTier(dimension.score);
  const { payload } = dimension;

  return (
    <article
      className={`${styles.dimCard} ${styles[tier]}`}
      data-testid="dimension-card"
      aria-label={`${dimension.dimension_name}: ${dimension.score} out of 100`}
    >
      <div className={styles.dimHeader}>
        <h3 className={styles.dimName}>{dimension.dimension_name}</h3>
        <span
          className={`${styles.dimScoreBadge} ${styles[tier]}`}
          data-testid="dimension-score"
        >
          {dimension.score}
        </span>
      </div>

      <div className={styles.dimPayload}>
        <div className={styles.dimPayloadRow}>
          <span className={styles.dimPayloadLabel}>Metric</span>
          <span className={styles.dimPayloadText}>{payload.metric}</span>
        </div>
        <div className={styles.dimPayloadRow}>
          <span className={styles.dimPayloadLabel}>Meaning</span>
          <span className={styles.dimPayloadText}>{payload.meaning}</span>
        </div>
        <div className={styles.dimPayloadRow}>
          <span className={styles.dimPayloadLabel}>Evidence</span>
          <span className={styles.dimPayloadText}>{payload.evidence}</span>
        </div>
        <div className={styles.dimPayloadRow}>
          <span className={styles.dimPayloadLabel}>Recommendation</span>
          <span className={styles.dimPayloadText}>{payload.recommendation}</span>
        </div>
        <div className={styles.dimPayloadRow}>
          <span className={styles.dimPayloadLabel}>Next action</span>
          <span className={styles.dimPayloadText}>{payload.next_action}</span>
        </div>
      </div>

      <footer className={styles.dimFooter}>
        <span className={styles.dimTime}>{formatRelativeTime(dimension.last_generated_at)}</span>
        <ConfidenceBadge level={dimension.confidence_level} />
      </footer>
    </article>
  );
}

// ---------------------------------------------------------------------------
// RecommendationItem — one priority action with module deep-link
// ---------------------------------------------------------------------------

interface RecommendationItemProps {
  recommendation: DimensionInsight;
  rank: number;
}

function RecommendationItem({ recommendation, rank }: RecommendationItemProps) {
  const modulePath = DIMENSION_MODULE_PATH[recommendation.dimension_id] ?? '/dashboard';

  return (
    <li className={styles.recItem} data-testid="recommendation-item">
      <span className={styles.recRank} aria-hidden="true">{rank}</span>
      <div className={styles.recBody}>
        <p className={styles.recDimName}>{recommendation.dimension_name}</p>
        <p className={styles.recAction}>{recommendation.payload.next_action}</p>
      </div>
      <Link
        to={modulePath}
        className={styles.recLink}
        aria-label={`Go to ${recommendation.dimension_name} module`}
        data-testid="recommendation-link"
      >
        Take action →
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// LoadingSkeleton — placeholder while data loads
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div data-testid="dashboard-loading">
      {/* Score section skeleton */}
      <div className={styles.skeletonScoreSection}>
        <SkeletonLoader
          className={styles.skeletonRing}
          width="120px"
          height="120px"
          borderRadius="50%"
        />
        <div className={styles.skeletonMeta}>
          <SkeletonLoader height="1.25rem" width="60%" />
          <SkeletonLoader height="0.875rem" width="90%" />
          <SkeletonLoader height="0.875rem" width="75%" />
        </div>
      </div>

      {/* Dimension cards skeleton */}
      <h2 className={styles.sectionHeading}>GTM Dimensions</h2>
      <div className={styles.dimensionGrid}>
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard — main page component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const [data, setData] = useState<DashboardResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getDashboard();
      setData(result);
    } catch {
      // If initial load fails, show empty state — user can trigger refresh
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      await refreshDashboard();
      // Reload dashboard after regeneration
      const result = await getDashboard();
      setData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Refresh failed. Please try again.';
      setRefreshError(message);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const isEmpty = !data || (data.dimensions.length === 0 && data.last_generated_at === null);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>⚡ Command Center</h1>
            <p className={styles.pageSubtitle}>GTM health scores, priority recommendations, and next best actions.</p>
          </div>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* ---- Page header ---- */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>⚡ Command Center</h1>
          <p className={styles.pageSubtitle}>GTM health scores, priority recommendations, and next best actions.</p>
        </div>
        <div className={styles.headerActions}>
          {data?.last_generated_at && (
            <span className={styles.lastUpdated} data-testid="last-updated">
              Updated {formatRelativeTime(data.last_generated_at)}
            </span>
          )}
          <button
            className={styles.refreshButton}
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
            aria-label="Refresh GTM insights"
            data-testid="refresh-button"
            type="button"
          >
            <span
              className={`${styles.refreshIcon}${isRefreshing ? ` ${styles.spinning}` : ''}`}
              aria-hidden="true"
            >
              ↻
            </span>
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ---- Refresh error banner ---- */}
      {refreshError && (
        <div className={styles.errorBanner} role="alert" data-testid="refresh-error">
          ⚠ {refreshError}
        </div>
      )}

      {/* ---- Empty / onboarding state ---- */}
      {isEmpty ? (
        <EmptyState
          icon="⚡"
          title="No insights generated yet"
          description="Connect Google Drive and index your GTM documents to generate your first health score. Then click Refresh to run the insight engine."
          action={{
            label: 'Go to Drive Hub',
            onClick: () => { window.location.href = '/drive'; },
          }}
        />
      ) : (
        <>
          {/* ---- Overall health score ---- */}
          <section className={styles.scoreSection} aria-label="Overall GTM health score">
            <HealthScoreRing score={data!.overall_health_score} />
            <div className={styles.scoreMeta}>
              <h2 className={styles.scoreHeading}>Overall GTM Health</h2>
              <p className={styles.scoreDescription}>
                {data!.overall_health_score >= 70
                  ? 'Your GTM motion is well-covered. Focus on the priority recommendations to close the remaining gaps.'
                  : data!.overall_health_score >= 40
                    ? 'Your GTM motion has a solid foundation with room to improve. Address the priority recommendations below.'
                    : 'Your GTM motion has significant coverage gaps. Start with the priority recommendations to build momentum.'}
              </p>
            </div>
          </section>

          {/* ---- Priority recommendations ---- */}
          {data!.priority_recommendations.length > 0 && (
            <section className={styles.recommendationsSection} aria-label="Priority recommendations">
              <h2 className={styles.sectionHeading}>🎯 Priority Recommendations</h2>
              <ol className={styles.recommendationList}>
                {data!.priority_recommendations.slice(0, 5).map((rec, i) => (
                  <RecommendationItem key={rec.dimension_id} recommendation={rec} rank={i + 1} />
                ))}
              </ol>
            </section>
          )}

          {/* ---- Dimension cards ---- */}
          <section className={styles.dimensionsSection} aria-label="GTM dimension scores">
            <h2 className={styles.sectionHeading}>📊 GTM Dimensions</h2>
            <div className={styles.dimensionGrid}>
              {data!.dimensions.map((dim) => (
                <DimensionCard key={dim.dimension_id} dimension={dim} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
