/**
 * SkeletonLoader — animated placeholder for loading states.
 * Uses a CSS shimmer animation with configurable width/height.
 */

import styles from './SkeletonLoader.module.css';

export interface SkeletonLoaderProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
}

export function SkeletonLoader({
  width = '100%',
  height = '1rem',
  borderRadius = '4px',
  className,
}: SkeletonLoaderProps) {
  return (
    <span
      className={`${styles.skeleton} ${className ?? ''}`.trim()}
      style={{ width, height, borderRadius }}
      role="status"
      aria-label="Loading"
      aria-busy="true"
      data-testid="skeleton-loader"
    />
  );
}

/** Pre-built card skeleton matching InsightCard/MetricStoryCard dimensions */
export function CardSkeleton() {
  return (
    <div className={styles.cardSkeleton} role="status" aria-label="Loading card" aria-busy="true" data-testid="card-skeleton">
      <SkeletonLoader height="1.125rem" width="70%" />
      <SkeletonLoader height="0.875rem" width="100%" />
      <SkeletonLoader height="0.875rem" width="90%" />
      <SkeletonLoader height="0.875rem" width="80%" />
      <SkeletonLoader height="1.5rem" width="5rem" borderRadius="9999px" />
    </div>
  );
}
