/**
 * EmptyState — shown when a list or panel has no data to display.
 */

import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon = '📭',
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={`${styles.emptyState} ${className ?? ''}`.trim()}
      role="status"
      aria-label={title}
      data-testid="empty-state"
    >
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {action && (
        <button
          className={styles.action}
          onClick={action.onClick}
          type="button"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
