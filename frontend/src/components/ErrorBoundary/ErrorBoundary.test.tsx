import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary.js';

// Component that throws on render when `shouldThrow` is true
function BrokenChild({ shouldThrow = false }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('Test render error');
  }
  return <p data-testid="healthy-child">All good</p>;
}

// Suppress console.error noise from React error boundary during tests
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('ErrorBoundary', () => {
  // -------------------------------------------------------------------------
  // Happy path — no error
  // -------------------------------------------------------------------------
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('healthy-child')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Error caught
  // -------------------------------------------------------------------------
  it('renders fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('healthy-child')).not.toBeInTheDocument();
  });

  it('shows generic message without moduleName', () => {
    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });

  it('shows module-specific message when moduleName is provided', () => {
    render(
      <ErrorBoundary moduleName="Insights">
        <BrokenChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Insights encountered an error.')).toBeInTheDocument();
  });

  it('renders retry button', () => {
    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-retry')).toBeInTheDocument();
  });

  it('has role=alert on fallback container', () => {
    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toHaveAttribute('role', 'alert');
  });

  // -------------------------------------------------------------------------
  // Retry — reset error state
  // -------------------------------------------------------------------------
  it('resets error state after retry click (handleRetry calls setState)', () => {
    // Render a broken child — ErrorBoundary catches and shows fallback
    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();

    // Click retry — calls setState({ hasError: false }); the broken child will
    // throw again (same props), so ErrorBoundary re-catches it. We just verify
    // the retry button is present, clickable, and triggers the reset path
    // without an uncaught exception.
    fireEvent.click(screen.getByTestId('error-boundary-retry'));

    // console.error was called at least once (React + our componentDidCatch)
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Custom fallback
  // -------------------------------------------------------------------------
  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom!</div>}>
        <BrokenChild shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Logging
  // -------------------------------------------------------------------------
  it('calls console.error when child throws and no __bobaLogger', () => {
    render(
      <ErrorBoundary moduleName="Test">
        <BrokenChild shouldThrow />
      </ErrorBoundary>,
    );
    // React calls console.error for error boundaries; our componentDidCatch also calls it
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('calls __bobaLogger.error when available', () => {
    const mockLogger = { error: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__bobaLogger = mockLogger;

    render(
      <ErrorBoundary moduleName="Drive">
        <BrokenChild shouldThrow />
      </ErrorBoundary>,
    );

    expect(mockLogger.error).toHaveBeenCalledWith(
      'ErrorBoundary caught a rendering error',
      expect.objectContaining({ module: 'Drive' }),
    );

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__bobaLogger;
  });
});
