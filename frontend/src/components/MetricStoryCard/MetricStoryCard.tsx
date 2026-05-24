/**
 * MetricStoryCard — renders a MetricStory with metric headline, evidence,
 * recommendation, and next action. Supports tri-state async rendering.
 */

import type { MetricStory } from '../../types/index.js';
import type { AsyncState } from '../../types/index.js';
import { CardSkeleton, EmptyState, ErrorState } from '../common/index.js';
import { formatRelativeTime } from '../../utils/index.js';
import styles from './MetricStoryCard.module.css';

export interface MetricStoryCardProps {
  state: AsyncState<MetricStory>;
  onRetry?: () => void;
}

export function MetricStoryCard({ state, onRetry }: MetricStoryCardProps) {
  const { data, status, error } = state;

  if (status === 'loading') {
    return <CardSkeleton />;
  }

  if (status === 'error') {
    return (
      <ErrorState
        message={error ?? 'Failed to load metric story.'}
        onRetry={onRetry}
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="No metric story yet"
        description="Metric stories appear once pipeline data is available."
        icon="📊"
      />
    );
  }

  return (
    <article className={styles.card} data-testid="metric-story-card">
      <header className={styles.header}>
        <span className={styles.metric}>{data.metric}</span>
        {data.period && <span className={styles.period}>{data.period}</span>}
      </header>

      <p className={styles.meaning}>{data.meaning}</p>

      {data.evidence.length > 0 && (
        <ul className={styles.evidenceList} aria-label="Evidence">
          {data.evidence.map((point, i) => (
            // Evidence sentences have no stable ID — index is acceptable here
            // eslint-disable-next-line react/no-array-index-key
            <li key={i} className={styles.evidenceItem}>
              {point}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.recommendation}>
        <span className={styles.recommendationLabel}>Recommendation</span>
        <p className={styles.recommendationText}>{data.recommendation}</p>
      </div>

      <div className={styles.nextAction}>
        <span className={styles.nextActionLabel}>Next action</span>
        <p className={styles.nextActionText}>{data.nextAction}</p>
      </div>

      <footer className={styles.footer}>
        <span className={styles.time}>{formatRelativeTime(data.createdAt)}</span>
      </footer>
    </article>
  );
}
