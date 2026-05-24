/**
 * Analytics Dashboard module tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Analytics from './index.js';
import {
  FIXTURE_ANALYTICS_RESULT,
  FIXTURE_ANALYTICS_RESULT_EMPTY,
  FIXTURE_QBR_EXPORT,
} from './fixtures.js';

vi.mock('./api.js', () => ({
  getAnalytics: vi.fn(),
  exportQbrReport: vi.fn(),
}));

import { getAnalytics, exportQbrReport } from './api.js';

const mockGetAnalytics = vi.mocked(getAnalytics);
const mockExportQbrReport = vi.mocked(exportQbrReport);

function renderAnalytics() {
  return render(
    <MemoryRouter>
      <Analytics />
    </MemoryRouter>
  );
}

describe('Analytics Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAnalytics.mockResolvedValue(FIXTURE_ANALYTICS_RESULT);
    mockExportQbrReport.mockResolvedValue(FIXTURE_QBR_EXPORT);
  });

  // ---------------------------------------------------------------------------
  // Page structure
  // ---------------------------------------------------------------------------

  describe('page structure', () => {
    it('renders the page heading', async () => {
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getByTestId('analytics-heading')).toBeInTheDocument()
      );
      expect(screen.getByTestId('analytics-heading')).toHaveTextContent('Analytics Dashboard');
    });

    it('renders export QBR button', async () => {
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getByTestId('export-qbr-button')).toBeInTheDocument()
      );
    });

    it('shows loading skeleton initially', () => {
      mockGetAnalytics.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(FIXTURE_ANALYTICS_RESULT), 200))
      );
      renderAnalytics();
      expect(screen.getByTestId('analytics-loading')).toBeInTheDocument();
    });

    it('hides loading skeleton after data loads', async () => {
      renderAnalytics();
      await waitFor(() =>
        expect(screen.queryByTestId('analytics-loading')).not.toBeInTheDocument()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Workspace health banner
  // ---------------------------------------------------------------------------

  describe('workspace health banner', () => {
    it('renders health banner with workspace score', async () => {
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getByTestId('health-banner')).toBeInTheDocument()
      );
      expect(screen.getByTestId('workspace-score')).toHaveTextContent(
        String(FIXTURE_ANALYTICS_RESULT.workspace_score)
      );
    });

    it('renders last updated time', async () => {
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getByTestId('analytics-last-updated')).toBeInTheDocument()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Dimension cards
  // ---------------------------------------------------------------------------

  describe('dimension cards', () => {
    it('renders correct number of dimension cards', async () => {
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getAllByTestId('dimension-card').length).toBe(
          FIXTURE_ANALYTICS_RESULT.dimensions.length
        )
      );
    });

    it('renders dimension grid', async () => {
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getByTestId('dimension-grid')).toBeInTheDocument()
      );
    });

    it('renders dimension names', async () => {
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getAllByTestId('dimension-name').length).toBeGreaterThan(0)
      );
      const firstDim = FIXTURE_ANALYTICS_RESULT.dimensions[0];
      expect(screen.getByText(firstDim.dimension)).toBeInTheDocument();
    });

    it('renders dimension scores', async () => {
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getAllByTestId('dimension-score').length).toBeGreaterThan(0)
      );
      const firstDim = FIXTURE_ANALYTICS_RESULT.dimensions[0];
      const scoreEls = screen.getAllByTestId('dimension-score');
      expect(scoreEls[0]).toHaveTextContent(String(firstDim.score));
    });

    it('renders trend indicators', async () => {
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getAllByTestId('dimension-trend').length).toBeGreaterThan(0)
      );
    });

    it('renders dimension meaning', async () => {
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getAllByTestId('dimension-meaning').length).toBeGreaterThan(0)
      );
      const firstDim = FIXTURE_ANALYTICS_RESULT.dimensions[0];
      expect(screen.getAllByTestId('dimension-meaning')[0]).toHaveTextContent(firstDim.meaning);
    });

    it('renders evidence bullet points', async () => {
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getAllByTestId('dimension-evidence').length).toBeGreaterThan(0)
      );
    });

    it('renders recommendation text', async () => {
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getAllByTestId('dimension-recommendation').length).toBeGreaterThan(0)
      );
    });

    it('renders next action text', async () => {
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getAllByTestId('dimension-next-action').length).toBeGreaterThan(0)
      );
    });

    it('has more than 10 dimensions', async () => {
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getAllByTestId('dimension-card').length).toBeGreaterThanOrEqual(10)
      );
    });
  });

  // ---------------------------------------------------------------------------
  // QBR Export
  // ---------------------------------------------------------------------------

  describe('QBR export', () => {
    it('export button is disabled when no data', async () => {
      mockGetAnalytics.mockResolvedValue(null);
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getByTestId('export-qbr-button')).toBeDisabled()
      );
    });

    it('shows export message after successful export', async () => {
      // Stub the anchor click so jsdom doesn't throw on navigation
      const origCreateElement = document.createElement.bind(document);
      const stubClick = vi.fn();
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreateElement(tag);
        if (tag === 'a') (el as HTMLAnchorElement).click = stubClick;
        return el;
      });

      renderAnalytics();
      await waitFor(() =>
        expect(screen.getByTestId('export-qbr-button')).not.toBeDisabled()
      );

      fireEvent.click(screen.getByTestId('export-qbr-button'));

      await waitFor(() =>
        expect(screen.getByTestId('export-message')).toBeInTheDocument()
      );
      expect(screen.getByTestId('export-message')).toHaveTextContent(FIXTURE_QBR_EXPORT.file_name);
      vi.restoreAllMocks();
    });

    it('shows error message when export fails', async () => {
      mockExportQbrReport.mockRejectedValue(new Error('Export failed'));
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getByTestId('export-qbr-button')).not.toBeDisabled()
      );

      fireEvent.click(screen.getByTestId('export-qbr-button'));

      await waitFor(() =>
        expect(screen.getByTestId('export-message')).toBeInTheDocument()
      );
      expect(screen.getByTestId('export-message')).toHaveTextContent('Export failed');
    });
  });

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  describe('empty state', () => {
    it('shows empty state when no dimensions', async () => {
      mockGetAnalytics.mockResolvedValue(FIXTURE_ANALYTICS_RESULT_EMPTY);
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getByText(/No analytics yet/i)).toBeInTheDocument()
      );
    });

    it('shows empty state when getAnalytics returns null', async () => {
      mockGetAnalytics.mockResolvedValue(null);
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getByText(/No analytics yet/i)).toBeInTheDocument()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  describe('error state', () => {
    it('shows error banner when getAnalytics fails', async () => {
      mockGetAnalytics.mockRejectedValue(new Error('Failed to load analytics'));
      renderAnalytics();
      await waitFor(() =>
        expect(screen.getByTestId('analytics-error')).toBeInTheDocument()
      );
      expect(screen.getByTestId('analytics-error')).toHaveTextContent('Failed to load analytics');
    });
  });
});
