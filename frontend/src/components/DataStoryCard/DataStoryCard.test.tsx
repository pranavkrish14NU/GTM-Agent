import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataStoryCard } from './DataStoryCard.js';
import {
  FIXTURE_DATA_STORY,
  FIXTURE_DATA_STORY_NUMBER,
} from '../../data/componentFixtures.js';
import type { AsyncState, DataStory } from '../../types/index.js';

const loading: AsyncState<DataStory> = { data: null, status: 'loading', error: null };
const idle: AsyncState<DataStory> = { data: null, status: 'idle', error: null };
const success = (ds: DataStory): AsyncState<DataStory> => ({
  data: ds,
  status: 'success',
  error: null,
});
const errorState = (msg: string): AsyncState<DataStory> => ({
  data: null,
  status: 'error',
  error: msg,
});

describe('DataStoryCard', () => {
  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------
  it('renders skeleton while loading', () => {
    render(<DataStoryCard state={loading} />);
    expect(screen.getByTestId('card-skeleton')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Error
  // -------------------------------------------------------------------------
  it('renders ErrorState on error', () => {
    render(<DataStoryCard state={errorState('Server error')} />);
    expect(screen.getByTestId('error-state')).toBeInTheDocument();
    expect(screen.getByText('Server error')).toBeInTheDocument();
  });

  it('calls onRetry when button clicked', () => {
    const onRetry = vi.fn();
    render(<DataStoryCard state={errorState('err')} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Empty / idle
  // -------------------------------------------------------------------------
  it('renders EmptyState when idle with no data', () => {
    render(<DataStoryCard state={idle} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Bar chart variant
  // -------------------------------------------------------------------------
  it('renders title and narrative for bar chart', () => {
    render(<DataStoryCard state={success(FIXTURE_DATA_STORY)} />);
    expect(screen.getByTestId('data-story-card')).toBeInTheDocument();
    expect(screen.getByText(FIXTURE_DATA_STORY.title)).toBeInTheDocument();
    expect(screen.getByText(FIXTURE_DATA_STORY.narrative)).toBeInTheDocument();
  });

  it('renders bar chart labels', () => {
    render(<DataStoryCard state={success(FIXTURE_DATA_STORY)} />);
    // FIXTURE_DATA_STORY has 4 data points: BOBA, Salesforce, HubSpot, Others
    expect(screen.getByText('BOBA')).toBeInTheDocument();
    expect(screen.getByText('Salesforce')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Number chart variant
  // -------------------------------------------------------------------------
  it('renders number chart value', () => {
    render(<DataStoryCard state={success(FIXTURE_DATA_STORY_NUMBER)} />);
    // FIXTURE_DATA_STORY_NUMBER has value: 72
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('Avg Freshness')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Line chart variant
  // -------------------------------------------------------------------------
  it('renders SVG for line chart type', () => {
    const lineStory: DataStory = {
      ...FIXTURE_DATA_STORY,
      chartType: 'line',
      dataPoints: [
        { label: 'Jan', value: 10 },
        { label: 'Feb', value: 20 },
        { label: 'Mar', value: 15 },
      ],
    };
    const { container } = render(<DataStoryCard state={success(lineStory)} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // No data points
  // -------------------------------------------------------------------------
  it('renders card without chart area when no dataPoints', () => {
    const noChart: DataStory = {
      ...FIXTURE_DATA_STORY,
      dataPoints: [],
    };
    render(<DataStoryCard state={success(noChart)} />);
    expect(screen.getByTestId('data-story-card')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
