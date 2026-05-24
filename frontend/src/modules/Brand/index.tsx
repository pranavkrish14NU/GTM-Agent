/**
 * Brand Intelligence page — 🎨 Brand Intelligence
 *
 * Features:
 *   - Consistency score gauge (0-100) with colour-coding (green/yellow/red)
 *   - Voice profile: detected tone, vocabulary patterns, style characteristics
 *   - Positioning themes extracted from brand documents
 *   - Drift alerts: documents deviating from brand voice with correction suggestions
 *   - Source citations for all data elements
 *   - On-demand brand re-analysis (member+ role)
 *   - Loading skeleton, empty-state onboarding, and error banner
 *
 * API: GET /v1/brand/analysis  (getBrandAnalysis)
 *      GET /v1/brand/drift     (getBrandDrift)
 *      POST /v1/brand/analyze  (analyzeBrand)
 */

import { useState, useEffect, useCallback } from 'react';
import { SkeletonLoader, CardSkeleton, EmptyState, ConfidenceBadge } from '../../components/common/index.js';
import { formatRelativeTime } from '../../utils/index.js';
import { getBrandAnalysis, getBrandDrift, analyzeBrand } from './api.js';
import type { BrandAnalysisResult, DriftAnalysisResult, DriftAlert, PositioningTheme } from './types.js';
import {
  getConsistencyTier,
  getDriftSeverity,
  TONE_LABELS,
} from './types.js';
import styles from './Brand.module.css';

// ---------------------------------------------------------------------------
// ConsistencyGauge — SVG doughnut gauge for consistency score
// ---------------------------------------------------------------------------

interface ConsistencyGaugeProps {
  score: number;
  documentCount: number;
}

function ConsistencyGauge({ score, documentCount }: ConsistencyGaugeProps) {
  const R = 45;
  const circumference = 2 * Math.PI * R;
  const filled = (Math.min(100, Math.max(0, score)) / 100) * circumference;
  const tier = getConsistencyTier(score);

  return (
    <div className={styles.gaugeCard} data-testid="consistency-gauge">
      <p className={styles.gaugeTitle}>Consistency Score</p>
      <div className={styles.gaugeWrap}>
        <svg
          className={styles.gaugeSvg}
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          <circle className={styles.gaugeTrack} cx="50" cy="50" r={R} />
          <circle
            className={`${styles.gaugeFill} ${styles[tier]}`}
            cx="50"
            cy="50"
            r={R}
            strokeDasharray={`${filled.toFixed(2)} ${circumference.toFixed(2)}`}
          />
        </svg>
        <div
          className={styles.gaugeLabel}
          aria-label={`Brand consistency score: ${score} out of 100`}
        >
          <span className={styles.gaugeValue} data-testid="consistency-score-value">
            {score}
          </span>
          <span className={styles.gaugeUnit}>/100</span>
        </div>
      </div>
      <p className={styles.gaugeMeta} data-testid="document-count">
        {documentCount} brand document{documentCount !== 1 ? 's' : ''} indexed
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VoiceProfileCard — tone, vocabulary patterns, style characteristics
// ---------------------------------------------------------------------------

interface VoiceProfileCardProps {
  analysis: BrandAnalysisResult;
}

function VoiceProfileCard({ analysis }: VoiceProfileCardProps) {
  const { voice_profile } = analysis;

  return (
    <div className={styles.voiceCard} data-testid="voice-profile">
      <h2 className={styles.sectionHeading}>Voice Profile</h2>
      <div className={styles.voiceGrid}>
        <div className={styles.voiceRow}>
          <span className={styles.voiceLabel}>Tone</span>
          <span className={styles.toneChip} data-testid="voice-tone">
            <span className={styles.toneDot} aria-hidden="true" />
            {TONE_LABELS[voice_profile.tone]}
            <span style={{ fontSize: '0.7rem', color: '#7c3aed' }}>
              ({voice_profile.tone_confidence}% confidence)
            </span>
          </span>
        </div>

        <div className={styles.voiceRow}>
          <span className={styles.voiceLabel}>Style Characteristics</span>
          <div className={styles.tagList} data-testid="style-characteristics">
            {voice_profile.style_characteristics.map((char) => (
              <span key={char} className={styles.tag}>
                {char}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.voiceRow} style={{ gridColumn: '1 / -1' }}>
          <span className={styles.voiceLabel}>Vocabulary Patterns</span>
          <div className={styles.tagList} data-testid="vocabulary-patterns">
            {voice_profile.vocabulary_patterns.map((term) => (
              <span key={term} className={styles.tag}>
                {term}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PositioningThemeCard — one brand positioning theme
// ---------------------------------------------------------------------------

function PositioningThemeCard({ theme }: { theme: PositioningTheme }) {
  return (
    <div className={styles.themeCard} data-testid="theme-card">
      <div className={styles.themeHeader}>
        <h3 className={styles.themeName}>{theme.theme}</h3>
        <span className={styles.themeConfidenceBadge} data-testid="theme-confidence">
          {theme.confidence_score}%
        </span>
      </div>
      <p className={styles.themeDesc}>{theme.description}</p>
      <span className={styles.themeDocCount}>
        {theme.supporting_documents} supporting document{theme.supporting_documents !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DriftAlertItem — one drift alert with deviation indicators
// ---------------------------------------------------------------------------

function DriftAlertItem({ alert }: { alert: DriftAlert }) {
  const severity = getDriftSeverity(alert.drift_score);
  const severityIcon =
    severity === 'critical' ? '🔴' : severity === 'warning' ? '🟡' : '🔵';

  return (
    <div
      className={`${styles.driftAlert} ${styles[severity]}`}
      data-testid="drift-alert"
      aria-label={`Drift alert for ${alert.document_title}: drift score ${alert.drift_score}`}
    >
      <div className={styles.driftHeader}>
        <h3 className={styles.driftDocTitle}>{alert.document_title}</h3>
        <span className={`${styles.driftScore} ${styles[severity]}`} data-testid="drift-score">
          {severityIcon} {alert.drift_score}/100
        </span>
      </div>

      <div className={styles.driftTypes} data-testid="deviation-types">
        {alert.deviation_types.map((type) => (
          <span key={type} className={styles.deviationType}>
            {type.replace(/_/g, ' ')}
          </span>
        ))}
      </div>

      <p className={styles.driftSuggestion} data-testid="correction-suggestion">
        💡 {alert.correction_suggestion}
      </p>

      <ConfidenceBadge level={alert.confidence_level} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// LoadingSkeleton — placeholder while data loads
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div data-testid="brand-loading">
      <div className={styles.skeletonGaugeSection}>
        <div className={styles.skeletonGauge}>
          <SkeletonLoader width="120px" height="120px" borderRadius="50%" />
          <SkeletonLoader height="0.875rem" width="80%" />
        </div>
        <div className={styles.skeletonVoice}>
          <SkeletonLoader height="1.25rem" width="40%" />
          <SkeletonLoader height="0.875rem" width="100%" />
          <SkeletonLoader height="0.875rem" width="85%" />
          <SkeletonLoader height="0.875rem" width="70%" />
        </div>
      </div>
      <div style={{ marginBottom: '2rem' }}>
        <SkeletonLoader height="1.25rem" width="30%" />
        <div className={styles.themeGrid} style={{ marginTop: '1rem' }}>
          {Array.from({ length: 3 }, (_, i) => <CardSkeleton key={i} />)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brand — main page component
// ---------------------------------------------------------------------------

export default function Brand() {
  const [analysis, setAnalysis] = useState<BrandAnalysisResult | null>(null);
  const [drift, setDrift] = useState<DriftAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeMessage, setAnalyzeMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [analysisData, driftData] = await Promise.all([
        getBrandAnalysis(),
        getBrandDrift(),
      ]);
      setAnalysis(analysisData);
      setDrift(driftData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load brand data');
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
      const result = await analyzeBrand();
      setAnalyzeMessage(result.message);
      await loadData();
    } catch (err) {
      setAnalyzeMessage(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [loadData]);

  const hasNoData = !isLoading && !error && !analysis;

  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle} data-testid="brand-heading">
            🎨 Brand Intelligence
          </h1>
          <p className={styles.pageSubtitle}>
            Voice analysis, positioning themes, consistency scoring, and drift detection.
          </p>
        </div>
        <div className={styles.headerActions}>
          {analysis?.last_analyzed_at && (
            <span className={styles.lastUpdated} data-testid="last-analyzed">
              Updated {formatRelativeTime(analysis.last_analyzed_at)}
            </span>
          )}
          <button
            type="button"
            className={styles.analyzeButton}
            onClick={() => void handleAnalyze()}
            disabled={isAnalyzing}
            data-testid="analyze-button"
            aria-label="Trigger brand analysis"
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
          data-testid="brand-error"
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
          icon="🎨"
          title="No brand analysis yet"
          description="Connect your Google Drive and run a brand analysis to see voice profile, consistency score, and positioning themes."
          action={{ label: 'Run Brand Analysis', onClick: () => void handleAnalyze() }}
        />
      )}

      {/* Main content */}
      {!isLoading && analysis && (
        <>
          {/* Summary row: consistency gauge + voice profile */}
          <div className={styles.summaryRow}>
            <ConsistencyGauge
              score={analysis.consistency_score}
              documentCount={analysis.total_brand_documents}
            />
            <VoiceProfileCard analysis={analysis} />
          </div>

          {/* Positioning themes */}
          <section className={styles.themesSection} aria-labelledby="themes-heading">
            <h2 id="themes-heading" className={styles.sectionHeading}>
              📌 Positioning Themes
            </h2>
            {analysis.positioning_themes.length > 0 ? (
              <div className={styles.themeGrid} data-testid="themes-grid">
                {analysis.positioning_themes.map((theme) => (
                  <PositioningThemeCard key={theme.theme} theme={theme} />
                ))}
              </div>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                No positioning themes detected yet.
              </p>
            )}
          </section>

          {/* Drift alerts */}
          <section className={styles.driftSection} aria-labelledby="drift-heading">
            <h2 id="drift-heading" className={styles.sectionHeading}>
              ⚠️ Drift Alerts
              {drift && drift.total > 0 && (
                <span
                  style={{
                    marginLeft: '0.5rem',
                    fontSize: '0.8125rem',
                    background: '#fee2e2',
                    color: '#991b1b',
                    padding: '0.125rem 0.5rem',
                    borderRadius: '9999px',
                  }}
                  data-testid="drift-count"
                >
                  {drift.total}
                </span>
              )}
            </h2>
            {drift && drift.alerts.length > 0 ? (
              <div className={styles.driftList} data-testid="drift-list">
                {drift.alerts.map((alert) => (
                  <DriftAlertItem key={alert.document_id} alert={alert} />
                ))}
              </div>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }} data-testid="no-drift">
                ✅ No brand drift detected — all documents align with your brand voice.
              </p>
            )}
          </section>

          {/* Source citations */}
          {analysis.sources.length > 0 && (
            <section className={styles.sourcesSection} aria-labelledby="sources-heading">
              <h2 id="sources-heading" className={styles.sectionHeading}>
                📚 Source Citations
              </h2>
              <div className={styles.sourceList} data-testid="sources-list">
                {analysis.sources.map((source) => (
                  <div key={source.sourceFileId} className={styles.sourceItem} data-testid="source-item">
                    <span className={styles.sourceName}>{source.sourceFileName}</span>
                    <span className={styles.sourceRelevance} data-testid="source-relevance">
                      {source.relevanceScore}% relevant
                    </span>
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
