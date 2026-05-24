/**
 * Persona Intelligence page — 👥 ICP & Personas
 *
 * Features:
 *   - PersonaCard components showing role, goals, pain points, buying triggers, objections
 *   - Content gaps with action buttons (e.g., "Create Case Study")
 *   - On-demand persona re-analysis (member+ role)
 *   - Loading skeleton, empty-state onboarding, and error banner
 *
 * API: GET /v1/personas         (getPersonas)
 *      POST /v1/personas/analyze (analyzePersonas)
 */

import { useState, useEffect, useCallback } from 'react';
import { SkeletonLoader, EmptyState } from '../../components/common/index.js';
import { formatRelativeTime } from '../../utils/index.js';
import { getPersonas, analyzePersonas } from './api.js';
import type { Persona, PersonasResult, ContentGap } from './types.js';
import { getGapPriorityColor } from './types.js';
import styles from './Personas.module.css';

// ---------------------------------------------------------------------------
// ContentGapItem — single content gap with action button
// ---------------------------------------------------------------------------

function ContentGapItem({ gap }: { gap: ContentGap }) {
  const dotColor = getGapPriorityColor(gap.priority);

  return (
    <div className={styles.contentGapItem} data-testid="content-gap-item">
      <span
        className={styles.gapPriorityDot}
        style={{ background: dotColor }}
        aria-label={`${gap.priority} priority`}
      />
      <span className={styles.gapTopic}>{gap.topic}</span>
      <button
        type="button"
        className={styles.gapActionButton}
        data-testid="content-gap-action"
        aria-label={`Create ${gap.suggested_content_type} for: ${gap.topic}`}
      >
        + Create {gap.suggested_content_type}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PersonaCard — full persona card with all sections
// ---------------------------------------------------------------------------

function PersonaCard({ persona }: { persona: Persona }) {
  return (
    <article className={styles.personaCard} data-testid="persona-card">
      {/* Header */}
      <div className={styles.personaCardHeader}>
        <div className={styles.personaAvatar} aria-hidden="true">
          👤
        </div>
        <h2 className={styles.personaRole} data-testid="persona-role">
          {persona.role}
        </h2>
      </div>

      {/* Goals */}
      <div className={styles.personaSection}>
        <p className={styles.personaSectionLabel}>Goals</p>
        <ul className={styles.personaList} data-testid="persona-goals">
          {persona.goals.map((goal) => (
            <li key={goal} className={styles.personaListItem}>
              {goal}
            </li>
          ))}
        </ul>
      </div>

      {/* Pain points */}
      <div className={styles.personaSection}>
        <p className={styles.personaSectionLabel}>Pain Points</p>
        <ul className={styles.personaList} data-testid="persona-pain-points">
          {persona.pain_points.map((pain) => (
            <li key={pain} className={styles.personaListItem}>
              {pain}
            </li>
          ))}
        </ul>
      </div>

      {/* Buying triggers */}
      <div className={styles.personaSection}>
        <p className={styles.personaSectionLabel}>Buying Triggers</p>
        <ul className={styles.personaList} data-testid="persona-buying-triggers">
          {persona.buying_triggers.map((trigger) => (
            <li key={trigger} className={styles.personaListItem}>
              {trigger}
            </li>
          ))}
        </ul>
      </div>

      {/* Objections */}
      <div className={styles.personaSection}>
        <p className={styles.personaSectionLabel}>Objections</p>
        <ul className={styles.personaList} data-testid="persona-objections">
          {persona.objections.map((obj) => (
            <li key={obj} className={styles.personaListItem}>
              {obj}
            </li>
          ))}
        </ul>
      </div>

      {/* Content gaps */}
      {persona.content_gaps.length > 0 && (
        <div className={styles.personaSection}>
          <p className={styles.personaSectionLabel}>Content Gaps</p>
          <div className={styles.contentGapsList} data-testid="persona-content-gaps">
            {persona.content_gaps.map((gap) => (
              <ContentGapItem key={gap.topic} gap={gap} />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// LoadingSkeleton — placeholder while data loads
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div data-testid="persona-loading">
      <div className={styles.skeletonGrid}>
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className={styles.skeletonCard}>
            <SkeletonLoader height="1.25rem" width="45%" />
            <SkeletonLoader height="0.875rem" width="100%" />
            <SkeletonLoader height="0.875rem" width="90%" />
            <SkeletonLoader height="0.875rem" width="75%" />
            <SkeletonLoader height="0.875rem" width="100%" />
            <SkeletonLoader height="0.875rem" width="60%" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Personas — main page component
// ---------------------------------------------------------------------------

export default function Personas() {
  const [result, setResult] = useState<PersonasResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeMessage, setAnalyzeMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getPersonas();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load personas');
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
      const response = await analyzePersonas();
      setAnalyzeMessage(response.message);
      await loadData();
    } catch (err) {
      setAnalyzeMessage(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  }, [loadData]);

  const hasNoData = !isLoading && !error && (!result || result.personas.length === 0);

  return (
    <div className={styles.page}>
      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle} data-testid="persona-heading">
            👥 ICP & Personas
          </h1>
          <p className={styles.pageSubtitle}>
            Auto-generated persona cards with goals, pain points, buying triggers, and content gaps.
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
            aria-label="Trigger persona analysis"
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
          data-testid="persona-error"
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
          icon="👥"
          title="No persona analysis yet"
          description="Connect your Google Drive and run a persona analysis to generate ICP cards with goals, pain points, and content gap recommendations."
          action={{ label: 'Run Persona Analysis', onClick: () => void handleAnalyze() }}
          data-testid="persona-empty"
        />
      )}

      {/* Main content */}
      {!isLoading && result && result.personas.length > 0 && (
        <div className={styles.personaGrid} data-testid="persona-grid">
          {result.personas.map((persona) => (
            <PersonaCard key={persona.id} persona={persona} />
          ))}
        </div>
      )}
    </div>
  );
}
