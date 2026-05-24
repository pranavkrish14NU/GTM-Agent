import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InsightCard } from './InsightCard.js';
import {
  FIXTURE_INSIGHT_HIGH,
  FIXTURE_INSIGHT_MEDIUM,
  FIXTURE_INSIGHT_LOW,
} from '../../data/componentFixtures.js';
import type { AsyncState, Insight } from '../../types/index.js';

const idle: AsyncState<Insight> = { data: null, status: 'idle', error: null };
const loading: AsyncState<Insight> = { data: null, status: 'loading', error: null };
const success = (insight: Insight): AsyncState<Insight> => ({
  data: insight,
  status: 'success',
  error: null,
});
const errorState = (msg: string): AsyncState<Insight> => ({
  data: null,
  status: 'error',
  error: msg,
});

describe('InsightCard', () => {
  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  it('renders CardSkeleton while loading', () => {
    render(<InsightCard state={loading} />);
    expect(screen.getByTestId('card-skeleton')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  it('renders ErrorState on error', () => {
    render(<InsightCard state={errorState('Network error')} />);
    expect(screen.getByTestId('error-state')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('calls onRetry when Try again is clicked', () => {
    const onRetry = vi.fn();
    render(<InsightCard state={errorState('oops')} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Empty / idle state
  // -------------------------------------------------------------------------
  it('renders EmptyState when status is idle with no data', () => {
    render(<InsightCard state={idle} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Data state — high confidence
  // -------------------------------------------------------------------------
  it('renders insight title and summary', () => {
    render(<InsightCard state={success(FIXTURE_INSIGHT_HIGH)} />);
    expect(screen.getByTestId('insight-card')).toBeInTheDocument();
    expect(screen.getByText(FIXTURE_INSIGHT_HIGH.title)).toBeInTheDocument();
    expect(screen.getByText(FIXTURE_INSIGHT_HIGH.summary)).toBeInTheDocument();
  });

  it('renders recommendation when present', () => {
    render(<InsightCard state={success(FIXTURE_INSIGHT_HIGH)} />);
    expect(screen.getByText(FIXTURE_INSIGHT_HIGH.recommendation!)).toBeInTheDocument();
  });

  it('renders ConfidenceBadge with correct level', () => {
    render(<InsightCard state={success(FIXTURE_INSIGHT_HIGH)} />);
    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toHaveAttribute('data-level', 'high');
  });

  // -------------------------------------------------------------------------
  // Data state — medium confidence
  // -------------------------------------------------------------------------
  it('renders medium confidence badge', () => {
    render(<InsightCard state={success(FIXTURE_INSIGHT_MEDIUM)} />);
    expect(screen.getByTestId('confidence-badge')).toHaveAttribute('data-level', 'medium');
  });

  // -------------------------------------------------------------------------
  // Data state — low confidence
  // -------------------------------------------------------------------------
  it('renders low confidence badge', () => {
    render(<InsightCard state={success(FIXTURE_INSIGHT_LOW)} />);
    expect(screen.getByTestId('confidence-badge')).toHaveAttribute('data-level', 'low');
  });

  // -------------------------------------------------------------------------
  // Source doc count
  // -------------------------------------------------------------------------
  it('renders source count in footer', () => {
    render(<InsightCard state={success(FIXTURE_INSIGHT_HIGH)} />);
    // FIXTURE_INSIGHT_HIGH has 2 sourceDocs
    expect(screen.getByText('2 sources')).toBeInTheDocument();
  });

  it('uses singular "source" for 1 doc', () => {
    const singleDoc = { ...FIXTURE_INSIGHT_HIGH, sourceDocs: ['doc-1'] };
    render(<InsightCard state={success(singleDoc)} />);
    expect(screen.getByText('1 source')).toBeInTheDocument();
  });
});
