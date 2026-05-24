import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SyncHealthPanel } from './SyncHealthPanel.js';
import {
  FIXTURE_SYNC_HEALTH,
  FIXTURE_SYNC_HEALTH_SYNCING,
  FIXTURE_SYNC_HEALTH_ERROR,
} from '../../data/componentFixtures.js';
import type { AsyncState, SyncHealthData } from '../../types/index.js';

const loading: AsyncState<SyncHealthData> = { data: null, status: 'loading', error: null };
const idle: AsyncState<SyncHealthData> = { data: null, status: 'idle', error: null };
const success = (d: SyncHealthData): AsyncState<SyncHealthData> => ({
  data: d,
  status: 'success',
  error: null,
});
const errorState = (msg: string): AsyncState<SyncHealthData> => ({
  data: null,
  status: 'error',
  error: msg,
});

describe('SyncHealthPanel', () => {
  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------
  it('renders skeleton while loading', () => {
    render(<SyncHealthPanel state={loading} />);
    expect(screen.getByTestId('card-skeleton')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Error
  // -------------------------------------------------------------------------
  it('renders ErrorState on error', () => {
    render(<SyncHealthPanel state={errorState('Auth failed')} />);
    expect(screen.getByTestId('error-state')).toBeInTheDocument();
    expect(screen.getByText('Auth failed')).toBeInTheDocument();
  });

  it('calls onRetry when clicked', () => {
    const onRetry = vi.fn();
    render(<SyncHealthPanel state={errorState('err')} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Empty / idle
  // -------------------------------------------------------------------------
  it('renders EmptyState when no data and shows Connect Drive action', () => {
    const onReconnect = vi.fn();
    render(<SyncHealthPanel state={idle} onReconnect={onReconnect} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Connect Drive' });
    fireEvent.click(btn);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Connected status
  // -------------------------------------------------------------------------
  it('renders connected status and email', () => {
    render(<SyncHealthPanel state={success(FIXTURE_SYNC_HEALTH)} />);
    expect(screen.getByTestId('sync-health-panel')).toBeInTheDocument();
    expect(screen.getByTestId('sync-status')).toHaveTextContent('Connected');
    expect(screen.getByText(FIXTURE_SYNC_HEALTH.connection.email)).toBeInTheDocument();
  });

  it('renders last synced time', () => {
    render(<SyncHealthPanel state={success(FIXTURE_SYNC_HEALTH)} />);
    expect(screen.getByTestId('last-synced')).toBeInTheDocument();
  });

  it('renders total files count', () => {
    render(<SyncHealthPanel state={success(FIXTURE_SYNC_HEALTH)} />);
    expect(screen.getByTestId('total-files')).toHaveTextContent('142');
  });

  it('renders freshness legend counts', () => {
    render(<SyncHealthPanel state={success(FIXTURE_SYNC_HEALTH)} />);
    // fresh:89, stale:38, outdated:15
    expect(screen.getByText('Fresh (89)')).toBeInTheDocument();
    expect(screen.getByText('Stale (38)')).toBeInTheDocument();
    expect(screen.getByText('Outdated (15)')).toBeInTheDocument();
  });

  it('does NOT show reconnect button when status is connected', () => {
    render(<SyncHealthPanel state={success(FIXTURE_SYNC_HEALTH)} onReconnect={vi.fn()} />);
    expect(screen.queryByTestId('reconnect-button')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Syncing status
  // -------------------------------------------------------------------------
  it('renders Syncing… status', () => {
    render(<SyncHealthPanel state={success(FIXTURE_SYNC_HEALTH_SYNCING)} />);
    expect(screen.getByTestId('sync-status')).toHaveTextContent('Syncing');
  });

  // -------------------------------------------------------------------------
  // Error status (data-level error, not fetch error)
  // -------------------------------------------------------------------------
  it('renders Error status and reconnect button', () => {
    const onReconnect = vi.fn();
    render(
      <SyncHealthPanel state={success(FIXTURE_SYNC_HEALTH_ERROR)} onReconnect={onReconnect} />,
    );
    expect(screen.getByTestId('sync-status')).toHaveTextContent('Error');
    const btn = screen.getByTestId('reconnect-button');
    fireEvent.click(btn);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});
