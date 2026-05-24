/**
 * Win/Loss Analysis page — 📊 Win / Loss Analysis
 *
 * Features:
 *   - Summary row: overall win rate + total deals analyzed
 *   - Deal patterns: cards showing pattern, frequency, win rate
 *   - Objection trends: cards showing objection, frequency, severity, personas affected
 *   - Competitor involvement matrix: table with win rate per competitor
 *   - Corrective actions: prioritized recommendations
 *   - Loading skeleton, empty state, error banner
 *
 * API: GET  /v1/winloss         (getWinLoss)
 *      POST /v1/winloss/analyze  (analyzeWinLoss)
 */

import { useState, useEffect, useCallback } from 'react';
import { SkeletonLoader, CardSkeleton, EmptyState } from '../../components/common/index.js';
import { formatRelativeTime } from '../../utils/index.js';
import { getWinLoss, analyzeWinLoss } from './api.js';
import type { WinLossResult } from './types.js';
import { getThreatTierStyle } from './types.js';
import styles from './WinLoss.module.css';

// ---------------------------------------------------------------------------
// LoadingSkeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div data-testid="winloss-loading">
      <div className={styles.summaryRow}>
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className={styles.skeletonCard} style={{ minHeight: '100px' }}>
            <SkeletonLoader height="2rem" width="60%" />
            <SkeletonLoader height="0.875rem" width="80%" />
          </div>
        ))}
      </div>
      <div className={styles.skeletonGrid}>
        {Array.from({ length: 3 }, (_, i) => <CardSkeleton key={i} />)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WinLoss — main page component
// ---------------------------------------------------------------------------

export default function WinLoss() {
  const [result, setResult] = useState<WinLossResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeMessage, setAnalyzeMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getWinLoss();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load win/loss analysis');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    setAnalyzeMessage(null);
    try {
      const response = await analyzeWinLoss();
      setAnalyzeMessage(response.message);
      await loadData();
    } catch (err) {
      setAnalyzeMessage(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [loadData]);

  const hasNoData = !isLoading && !error && !result;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle} data-testid="winloss-heading">
            📊 Win / Loss Analysis
          </h1>
          <p className={styles.pageSubtitle}>
            Deal pattern extraction, objection trends, competitor involvement, and corrective actions.
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
          >
            {isAnalyzing ? '⟳ Analyzing…' : '⟳ Analyze'}
          </button>
        </div>
      </div>

      {/* Status */}
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

      {error && (
        <p className={styles.errorBanner} role="alert" data-testid="winloss-error">
          {error}
        </p>
      )}

      {isLoading && <LoadingSkeleton />}

      {hasNoData && (
        <EmptyState
          icon="📊"
          title="No win/loss analysis yet"
          description="Connect your CRM and Google Drive, then run an analysis to surface deal patterns, objection trends, and competitive insights."
          action={{ label: 'Run Analysis', onClick: () => void handleAnalyze() }}
        />
      )}

      {!isLoading && result && (
        <>
          {/* Summary row */}
          <div className={styles.summaryRow}>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Overall Win Rate</p>
              <p className={styles.summaryValue} data-testid="win-rate-summary">
                {result.overall_win_rate}%
              </p>
              <p className={styles.summarySubtext}>across all analyzed deals</p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Deals Analyzed</p>
              <p className={styles.summaryValue} data-testid="deal-count">
                {result.total_deals_analyzed}
              </p>
              <p className={styles.summarySubtext}>from connected CRM and Drive</p>
            </div>
          </div>

          {/* Deal patterns */}
          {result.deal_patterns.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionHeading}>🔍 Deal Patterns</h2>
              <div className={styles.patternGrid}>
                {result.deal_patterns.map((pattern) => (
                  <div key={pattern.pattern} className={styles.patternCard} data-testid="deal-pattern">
                    <h3 className={styles.patternName}>{pattern.pattern}</h3>
                    <div className={styles.patternStats}>
                      <div className={styles.patternStat}>
                        <span className={styles.patternStatValue} data-testid="pattern-frequency">
                          {pattern.frequency}
                        </span>
                        <span className={styles.patternStatLabel}>Deals</span>
                      </div>
                      <div className={styles.patternStat}>
                        <span className={styles.patternStatValue}>{pattern.win_rate}%</span>
                        <span className={styles.patternStatLabel}>Win Rate</span>
                      </div>
                    </div>
                    <p className={styles.patternDescription}>{pattern.description}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Objection trends */}
          {result.objection_trends.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionHeading}>💬 Objection Trends</h2>
              <div className={styles.objectionList}>
                {result.objection_trends.map((trend) => (
                  <div
                    key={trend.objection}
                    className={styles.objectionCard}
                    style={{ borderLeftColor: trend.severity === 'high' ? '#ef4444' : trend.severity === 'medium' ? '#f59e0b' : '#22c55e' }}
                    data-testid="objection-trend"
                  >
                    <div className={styles.objectionHeader}>
                      <h3 className={styles.objectionText}>{trend.objection}</h3>
                      <span className={`${styles.frequencyBadge} ${styles[trend.severity]}`} data-testid="objection-frequency">
                        {trend.frequency}× raised
                      </span>
                    </div>
                    <p className={styles.objectionPersonas} data-testid="objection-personas">
                      Personas: {trend.personas_affected.join(', ')}
                    </p>
                    <p className={styles.objectionDealsLost}>
                      {trend.deals_lost} deals lost due to this objection
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Competitor involvement */}
          {result.competitor_involvement.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionHeading}>⚔️ Competitor Involvement</h2>
              <table className={styles.competitorTable}>
                <thead>
                  <tr>
                    <th>Competitor</th>
                    <th>Deals Involved</th>
                    <th>Our Win Rate</th>
                    <th>Threat Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {result.competitor_involvement.map((comp) => {
                    const tierStyle = getThreatTierStyle(comp.threat_tier);
                    return (
                      <tr key={comp.competitor_name} data-testid="competitor-involvement">
                        <td className={styles.competitorName}>{comp.competitor_name}</td>
                        <td>{comp.deals_involved}</td>
                        <td>
                          <div className={styles.winRateBar}>
                            <span className={styles.winRateValue} data-testid="competitor-win-rate">
                              {comp.win_rate_against}%
                            </span>
                            <div className={styles.winRateTrack}>
                              <div
                                className={styles.winRateFill}
                                style={{
                                  width: `${comp.win_rate_against}%`,
                                  background: comp.win_rate_against >= 60 ? '#22c55e' : comp.win_rate_against >= 40 ? '#f59e0b' : '#ef4444',
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className={styles.threatBadge}
                            style={{ background: tierStyle.bg, color: tierStyle.text }}
                          >
                            {comp.threat_tier}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          {/* Corrective actions */}
          {result.corrective_actions.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionHeading}>🎯 Corrective Actions</h2>
              <div className={styles.actionList}>
                {result.corrective_actions.map((action) => (
                  <div key={action.issue} className={styles.actionCard} data-testid="corrective-action">
                    <h3 className={styles.actionIssue}>{action.issue}</h3>
                    <p className={styles.actionRecommendation}>{action.recommended_action}</p>
                    <div className={styles.actionMeta}>
                      <span className={`${styles.actionTag} ${styles[action.priority]}`}>
                        {action.priority} priority
                      </span>
                      <span className={`${styles.actionTag} ${styles[action.confidence_level]}`}>
                        {action.confidence_level} confidence
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
