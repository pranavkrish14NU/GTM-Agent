/**
 * ErrorState — shown when a panel fails to load data.
 * Provides optional retry action.
 */

import styles from './ErrorState.module.css';

export interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  message = 'Something went wrong. Please try again.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={`${styles.errorState} ${className ?? ''}`.trim()}
      role="alert"
      aria-live="assertive"
      data-testid="error-state"
    >
      <span className={styles.icon} aria-hidden="true">
        ⚠️
      </span>
      <p className={styles.message}>{message}</p>
      {onRetry && (
        <button
          className={styles.retryButton}
          onClick={onRetry}
          type="button"
          aria-label="Retry"
        >
          Try again
        </button>
      )}
    </div>
  );
}
