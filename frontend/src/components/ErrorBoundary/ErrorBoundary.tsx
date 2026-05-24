/**
 * ErrorBoundary — class component that catches React rendering errors.
 *
 * Wraps module-level subtrees so one module crash doesn't affect others.
 * Displays a friendly recovery UI with a retry button.
 * Logs errors to the structured logging system (console.error in dev,
 * window.__bobaLogger in production — follows the logger pattern in logger/).
 *
 * Usage:
 *   <ErrorBoundary moduleName="Insights">
 *     <InsightsModule />
 *   </ErrorBoundary>
 */

import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import styles from './ErrorBoundary.module.css';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Module label shown in the error message, e.g. "Insights" */
  moduleName?: string;
  /** Optional fallback override — replaces the built-in error UI */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Structured logging: use window.__bobaLogger if available, fall back to console.error.
    // This keeps the ErrorBoundary decoupled from a specific logger import.
    const logger =
      typeof window !== 'undefined' &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__bobaLogger;

    if (logger && typeof logger.error === 'function') {
      logger.error('ErrorBoundary caught a rendering error', {
        module: this.props.moduleName ?? 'unknown',
        error: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
      });
    } else {
      console.error(
        `[ErrorBoundary][${this.props.moduleName ?? 'unknown'}] Rendering error:`,
        error,
        info.componentStack,
      );
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const { moduleName } = this.props;
    return (
      <div
        className={styles.errorContainer}
        role="alert"
        aria-live="assertive"
        data-testid="error-boundary-fallback"
      >
        <span className={styles.icon} aria-hidden="true">
          ⚠️
        </span>
        <p className={styles.message}>
          {moduleName ? `${moduleName} encountered an error.` : 'Something went wrong.'}
        </p>
        <p className={styles.subMessage}>
          This module crashed but the rest of the application is still working.
        </p>
        <button
          className={styles.retryButton}
          onClick={this.handleRetry}
          type="button"
          data-testid="error-boundary-retry"
        >
          Try again
        </button>
      </div>
    );
  }
}
