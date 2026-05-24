/**
 * Competitor Intelligence page — ⚔️ Competitor Intelligence
 *
 * Features:
 *   - Competitor cards with threat score badges (critical/high/medium/low)
 *   - Click-to-open battlecard in a right-side context drawer
 *   - Battlecard shows: strengths, weaknesses, differentiation matrix, counter-messaging
 *   - On-demand competitor re-analysis (member+ role)
 *   - Loading skeleton, empty-state onboarding, and error banner
 *
 * API: GET /v1/competitors                    (getCompetitors)
 *      GET /v1/competitors/:id/battlecard      (getCompetitorBattlecard)
 *      POST /v1/competitors/analyze            (analyzeCompetitors)
 */

import { useState, useEffect, useCallback } from 'react';
import { SkeletonLoader, CardSkeleton, EmptyState } from '../../components/common/index.js';
import { formatRelativeTime } from '../../utils/index.js';
import { useDrawer } from '../../context/DrawerContext.js';
import { getCompetitors, getCompetitorBattlecard, analyzeCompetitors } from './api.js';
import type { Competitor, Battlecard, CompetitorsResult } from './types.js';
import { getThreatTier, THREAT_TIER_LABELS } from './types.js';
import styles from './Competitors.module.css';

// ---------------------------------------------------------------------------
// BattlecardView — rendered inside the Drawer
// ---------------------------------------------------------------------------

function BattlecardView({ battlecard }: { battlecard: Battlecard }) {
  return (
    <div>
      {/* Strengths */}
      <div className={styles.battlecardSection}>
        <p className={styles.battlecardSectionTitle}>✅ Strengths</p>
        <ul className={styles.battlecardList} data-testid="battlecard-strengths">
          {battlecard.strengths.map((s) => (
            <li key={s} className={styles.battlecardListItem}>
              {s}
            </li>
          ))}
        </ul>
      </div>

      {/* Weaknesses */}
      <div className={styles.battlecardSection}>
        <p className={styles.battlecardSectionTitle}>⚠️ Weaknesses</p>
        <ul className={styles.battlecardList} data-testid="battlecard-weaknesses">
          {battlecard.weaknesses.map((w) => (
            <li key={w} className={styles.battlecardListItem}>
              {w}
            </li>
          ))}
        </ul>
      </div>

      {/* Differentiation matrix */}
      <div className={styles.battlecardSection}>
        <p className={styles.battlecardSectionTitle}>📊 Differentiation Matrix</p>
        <table className={styles.matrixTable} data-testid="battlecard-matrix">
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Us</th>
              <th>Them</th>
            </tr>
          </thead>
          <tbody>
            {battlecard.differentiation_matrix.map((row) => (
              <tr key={row.dimension} data-testid="battlecard-matrix-row">
                <td className={styles.matrixDimension}>{row.dimension}</td>
                <td className={styles.matrixUs}>{row.us}</td>
                <td className={styles.matrixThem}>{row.them}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Counter messaging */}
      <div className={styles.battlecardSection}>
        <p className={styles.battlecardSectionTitle}>💬 Counter-Messaging</p>
        <div data-testid="battlecard-counter-messaging">
          {battlecard.counter_messaging.map((cm) => (
            <div key={cm.objection} className={styles.counterCard} data-testid="battlecard-counter-message">
              <p className={styles.counterObjection}>"{cm.objection}"</p>
              <p className={styles.counterResponse}>{cm.response}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CompetitorCard — clickable card that opens the battlecard drawer
// ---------------------------------------------------------------------------

interface CompetitorCardProps {
  competitor: Competitor;
  onSelect: (competitor: Competitor) => void;
}

function CompetitorCard({ competitor, onSelect }: CompetitorCardProps) {
  const tier = getThreatTier(competitor.threat_score);

  return (
    <div
      className={styles.competitorCard}
      data-testid="competitor-card"
      onClick={() => onSelect(competitor)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(competitor);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`View battlecard for ${competitor.name}`}
    >
      <div className={styles.cardHeader}>
        <h2 className={styles.competitorName} data-testid="competitor-name">
          {competitor.name}
        </h2>
        <span
          className={`${styles.threatBadge} ${styles[tier]}`}
          data-testid="threat-score"
          aria-label={`Threat score: ${competitor.threat_score} — ${THREAT_TIER_LABELS[tier]}`}
        >
          {competitor.threat_score}/100
          <span style={{ marginLeft: '0.25rem', fontSize: '0.6875rem' }}>
            {THREAT_TIER_LABELS[tier]}
          </span>
        </span>
      </div>

      <ul className={styles.differentiatorList} data-testid="key-differentiators">
        {competitor.key_differentiators.map((diff) => (
          <li key={diff} className={styles.differentiatorItem}>
            {diff}
          </li>
        ))}
      </ul>

      <div className={styles.cardFooter}>
        {competitor.last_updated && (
          <span className={styles.cardTimestamp} data-testid="competitor-last-updated">
            Updated {formatRelativeTime(competitor.last_updated)}
          </span>
        )}
        <span className={styles.viewBattlecardLink}>View battlecard →</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LoadingSkeleton — placeholder while data loads
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div data-testid="competitor-loading">
      <div className={styles.skeletonGrid}>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={styles.skeletonCard}>
            <SkeletonLoader height="1.25rem" width="50%" />
            <SkeletonLoader height="0.875rem" width="100%" />
            <SkeletonLoader height="0.875rem" width="80%" />
            <SkeletonLoader height="0.875rem" width="65%" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Competitors — main page component
// ---------------------------------------------------------------------------

export default function Competitors() {
  const [result, setResult] = useState<CompetitorsResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeMessage, setAnalyzeMessage] = useState<string | null>(null);

  const { openDrawer } = useDrawer();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getCompetitors();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load competitors');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSelectCompetitor = useCallback(
    async (competitor: Competitor) => {
      // Open the drawer immediately with a loading indicator
      openDrawer({
        title: competitor.name,
        content: (
          <div className={styles.battlecardLoading} data-testid="battlecard-loading">
            <SkeletonLoader height="1rem" width="40%" />
            <SkeletonLoader height="0.875rem" width="100%" />
            <SkeletonLoader height="0.875rem" width="85%" />
            <SkeletonLoader height="0.875rem" width="70%" />
          </div>
        ),
      });

      try {
        const battlecard = await getCompetitorBattlecard(competitor.id);
        // Re-open the drawer with the loaded battlecard content
        openDrawer({
          title: `⚔️ ${competitor.name}`,
          content: <BattlecardView battlecard={battlecard} />,
        });
      } catch {
        openDrawer({
          title: competitor.name,
          content: (
            <p data-testid="battlecard-error" style={{ color: '#991b1b' }}>
              Failed to load battlecard. Please try again.
            </p>
          ),
        });
      }
    },
    [openDrawer],
  );

  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    setAnalyzeMessage(null);
    try {
      const response = await analyzeCompetitors();
      setAnalyzeMessage(response.message);
      await loadData();
    } catch (err) {
      setAnalyzeMessage(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [loadData]);

  const hasNoData = !isLoading && !error && (!result || result.competitors.length === 0);

  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle} data-testid="competitor-heading">
            ⚔️ Competitor Intelligence
          </h1>
          <p className={styles.pageSubtitle}>
            Battlecards, differentiation matrix, threat scoring, and counter-messaging.
          </p>
        </div>
        <div className={styles.headerActions}>
          {result?.last_analyzed_at && (
            <span className={styles.lastUpdated} data-testid="last-analyzed">
              Updated {formatRelativeTime(result.last_analyzed_at)}
            </span>
          )}
          <button
            type="button"
            className={styles.analyzeButton}
            onClick={() => void handleAnalyze()}
            disabled={isAnalyzing}
            data-testid="analyze-button"
            aria-label="Trigger competitor analysis"
          >
            {isAnalyzing ? '⟳ Analyzing…' : '⟳ Analyze'}
          </button>
        </div>
      </div>

      {/* Status message */}
      {analyzeMessage && (
        <p
          className={styles.errorBanner}
          style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534' }}
          data-testid="analyze-message"
          role="status"
        >
          {analyzeMessage}
        </p>
      )}

      {/* Error state */}
      {error && (
        <p
          className={styles.errorBanner}
          role="alert"
          data-testid="competitor-error"
          aria-live="assertive"
        >
          {error}
        </p>
      )}

      {/* Loading state */}
      {isLoading && <LoadingSkeleton />}

      {/* Empty state */}
      {hasNoData && (
        <EmptyState
          icon="⚔️"
          title="No competitor analysis yet"
          description="Connect your Google Drive and run a competitor analysis to generate battlecards, threat scores, and counter-messaging."
          action={{ label: 'Run Competitor Analysis', onClick: () => void handleAnalyze() }}
          data-testid="competitor-empty"
        />
      )}

      {/* Main content */}
      {!isLoading && result && result.competitors.length > 0 && (
        <div className={styles.competitorGrid} data-testid="competitor-grid">
          {result.competitors.map((competitor) => (
            <CompetitorCard
              key={competitor.id}
              competitor={competitor}
              onSelect={handleSelectCompetitor}
            />
          ))}
        </div>
      )}
    </div>
  );
}
