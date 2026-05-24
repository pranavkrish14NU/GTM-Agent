import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MetricStoryCard } from './MetricStoryCard.js';
import { FIXTURE_METRIC_STORY } from '../../data/componentFixtures.js';
import type { AsyncState, MetricStory } from '../../types/index.js';

const loading: AsyncState<MetricStory> = { data: null, status: 'loading', error: null };
const idle: AsyncState<MetricStory> = { data: null, status: 'idle', error: null };
const success = (ms: MetricStory): AsyncState<MetricStory> => ({
  data: ms,
  status: 'success',
  error: null,
});
const errorState = (msg: string): AsyncState<MetricStory> => ({
  data: null,
  status: 'error',
  error: msg,
});

describe('MetricStoryCard', () => {
  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------
  it('renders skeleton while loading', () => {
    render(<MetricStoryCard state={loading} />);
    expect(screen.getByTestId('card-skeleton')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Error
  // -------------------------------------------------------------------------
  it('renders ErrorState on error', () => {
    render(<MetricStoryCard state={errorState('Timeout')} />);
    expect(screen.getByTestId('error-state')).toBeInTheDocument();
    expect(screen.getByText('Timeout')).toBeInTheDocument();
  });

  it('calls onRetry when button clicked', () => {
    const onRetry = vi.fn();
    render(<MetricStoryCard state={errorState('err')} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Empty / idle
  // -------------------------------------------------------------------------
  it('renders EmptyState when idle with no data', () => {
    render(<MetricStoryCard state={idle} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Data state
  // -------------------------------------------------------------------------
  it('renders metric headline', () => {
    render(<MetricStoryCard state={success(FIXTURE_METRIC_STORY)} />);
    expect(screen.getByTestId('metric-story-card')).toBeInTheDocument();
    expect(screen.getByText(FIXTURE_METRIC_STORY.metric)).toBeInTheDocument();
  });

  it('renders period when provided', () => {
    render(<MetricStoryCard state={success(FIXTURE_METRIC_STORY)} />);
    expect(screen.getByText(FIXTURE_METRIC_STORY.period!)).toBeInTheDocument();
  });

  it('renders meaning paragraph', () => {
    render(<MetricStoryCard state={success(FIXTURE_METRIC_STORY)} />);
    expect(screen.getByText(FIXTURE_METRIC_STORY.meaning)).toBeInTheDocument();
  });

  it('renders all evidence bullet points', () => {
    render(<MetricStoryCard state={success(FIXTURE_METRIC_STORY)} />);
    FIXTURE_METRIC_STORY.evidence.forEach((point) => {
      expect(screen.getByText(point)).toBeInTheDocument();
    });
  });

  it('renders recommendation text', () => {
    render(<MetricStoryCard state={success(FIXTURE_METRIC_STORY)} />);
    expect(screen.getByText(FIXTURE_METRIC_STORY.recommendation)).toBeInTheDocument();
  });

  it('renders next action text', () => {
    render(<MetricStoryCard state={success(FIXTURE_METRIC_STORY)} />);
    expect(screen.getByText(FIXTURE_METRIC_STORY.nextAction)).toBeInTheDocument();
  });

  it('omits period section when not provided', () => {
    const noPeriod = { ...FIXTURE_METRIC_STORY, period: undefined };
    render(<MetricStoryCard state={success(noPeriod)} />);
    expect(screen.queryByText('Q2 2026')).not.toBeInTheDocument();
  });
});
