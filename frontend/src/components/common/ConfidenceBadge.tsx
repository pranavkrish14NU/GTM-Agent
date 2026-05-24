/**
 * ConfidenceBadge — pill badge for Insight confidence levels.
 * Maps 'high' → green, 'medium' → amber, 'low' → red.
 */

import type { ConfidenceLevel } from '../../types/index.js';
import styles from './ConfidenceBadge.module.css';

export interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  className?: string;
}

const LABEL: Record<ConfidenceLevel, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function ConfidenceBadge({ level, className }: ConfidenceBadgeProps) {
  return (
    <span
      className={`${styles.badge} ${styles[level]} ${className ?? ''}`.trim()}
      data-testid="confidence-badge"
      data-level={level}
      aria-label={`Confidence: ${LABEL[level]}`}
    >
      {LABEL[level]}
    </span>
  );
}
