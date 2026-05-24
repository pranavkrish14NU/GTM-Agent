/**
 * InsightCard — renders a single AI-generated Insight with tri-state support.
 * Tri-states: loading (skeleton), empty, error, and data.
 */

import type { Insight } from '../../types/index.js';
import type { AsyncState } from '../../types/index.js';
import { CardSkeleton, EmptyState, ErrorState, ConfidenceBadge } from '../common/index.js';
import { formatRelativeTime } from '../../utils/index.js';
import styles from './InsightCard.module.css';

export interface InsightCardProps {
  state: AsyncState<Insight>;
  onRetry?: () => void;
}

const TYPE_LABEL: Record<Insight['type'], string> = {
  brand: 'Brand',
  competitor: 'Competitor',
  persona: 'Persona',
  'win-loss': 'Win/Loss',
  campaign: 'Campaign',
};

export function InsightCard({ state, onRetry }: InsightCardProps) {
  const { data, status, error } = state;

  if (status === 'loading') {
    return <CardSkeleton />;
  }

  if (status === 'error') {
    return (
      <ErrorState
        message={error ?? 'Failed to load insight.'}
        onRetry={onRetry}
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="No insight available"
        description="Check back after more documents are indexed."
      />
    );
  }

  return (
    <article className={styles.card} data-testid="insight-card">
      <header className={styles.header}>
        <span className={styles.type}>{TYPE_LABEL[data.type]}</span>
        <ConfidenceBadge level={data.confidence} />
      </header>

      <h3 className={styles.title}>{data.title}</h3>
      <p className={styles.summary}>{data.summary}</p>

      {data.recommendation && (
        <div className={styles.recommendation}>
          <span className={styles.recommendationLabel}>Recommendation</span>
          <p className={styles.recommendationText}>{data.recommendation}</p>
        </div>
      )}

      <footer className={styles.footer}>
        <span className={styles.time}>{formatRelativeTime(data.createdAt)}</span>
        <span className={styles.sourceDocs}>
          {data.sourceDocs.length} source{data.sourceDocs.length !== 1 ? 's' : ''}
        </span>
      </footer>
    </article>
  );
}
