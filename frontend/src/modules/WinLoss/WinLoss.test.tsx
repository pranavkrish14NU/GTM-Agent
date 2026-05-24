/**
 * WinLoss module tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import WinLoss from './index.js';
import {
  FIXTURE_WIN_LOSS_RESULT,
} from './fixtures.js';

vi.mock('./api.js', () => ({
  getWinLoss: vi.fn(),
  analyzeWinLoss: vi.fn(),
}));

import { getWinLoss, analyzeWinLoss } from './api.js';

const mockGetWinLoss = vi.mocked(getWinLoss);
const mockAnalyzeWinLoss = vi.mocked(analyzeWinLoss);

function renderWinLoss() {
  return render(
    <MemoryRouter>
      <WinLoss />
    </MemoryRouter>
  );
}

describe('WinLoss page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWinLoss.mockResolvedValue(FIXTURE_WIN_LOSS_RESULT);
    mockAnalyzeWinLoss.mockResolvedValue({ message: 'Analysis complete' });
  });

  // ---------------------------------------------------------------------------
  // Page structure
  // ---------------------------------------------------------------------------

  describe('page structure', () => {
    it('renders the page heading', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getByTestId('winloss-heading')).toBeInTheDocument()
      );
      expect(screen.getByTestId('winloss-heading')).toHaveTextContent('Win / Loss Analysis');
    });

    it('renders the analyze button', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getByTestId('analyze-button')).toBeInTheDocument()
      );
    });

    it('shows loading skeleton initially', () => {
      mockGetWinLoss.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(FIXTURE_WIN_LOSS_RESULT), 200))
      );
      renderWinLoss();
      expect(screen.getByTestId('winloss-loading')).toBeInTheDocument();
    });

    it('hides loading skeleton after data loads', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.queryByTestId('winloss-loading')).not.toBeInTheDocument()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Summary cards
  // ---------------------------------------------------------------------------

  describe('summary cards', () => {
    it('renders overall win rate', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getByTestId('win-rate-summary')).toBeInTheDocument()
      );
      expect(screen.getByTestId('win-rate-summary')).toHaveTextContent(
        `${FIXTURE_WIN_LOSS_RESULT.overall_win_rate}%`
      );
    });

    it('renders total deals analyzed', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getByTestId('deal-count')).toBeInTheDocument()
      );
      expect(screen.getByTestId('deal-count')).toHaveTextContent(
        String(FIXTURE_WIN_LOSS_RESULT.total_deals_analyzed)
      );
    });

    it('renders last analyzed timestamp', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getByTestId('last-analyzed')).toBeInTheDocument()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Deal patterns
  // ---------------------------------------------------------------------------

  describe('deal patterns', () => {
    it('renders deal pattern cards', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getAllByTestId('deal-pattern').length).toBeGreaterThan(0)
      );
    });

    it('renders correct number of deal pattern cards', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getAllByTestId('deal-pattern').length).toBe(
          FIXTURE_WIN_LOSS_RESULT.deal_patterns.length
        )
      );
    });

    it('renders pattern frequency values', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getAllByTestId('pattern-frequency').length).toBeGreaterThan(0)
      );
      const frequencyEls = screen.getAllByTestId('pattern-frequency');
      expect(frequencyEls[0]).toHaveTextContent(
        String(FIXTURE_WIN_LOSS_RESULT.deal_patterns[0].frequency)
      );
    });

    it('renders pattern names', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getAllByTestId('deal-pattern').length).toBeGreaterThan(0)
      );
      const firstPattern = FIXTURE_WIN_LOSS_RESULT.deal_patterns[0];
      expect(screen.getByText(firstPattern.pattern)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Objection trends
  // ---------------------------------------------------------------------------

  describe('objection trends', () => {
    it('renders objection trend cards', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getAllByTestId('objection-trend').length).toBeGreaterThan(0)
      );
    });

    it('renders correct number of objection trend cards', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getAllByTestId('objection-trend').length).toBe(
          FIXTURE_WIN_LOSS_RESULT.objection_trends.length
        )
      );
    });

    it('renders objection frequency badges', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getAllByTestId('objection-frequency').length).toBeGreaterThan(0)
      );
    });

    it('renders personas affected', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getAllByTestId('objection-personas').length).toBeGreaterThan(0)
      );
      const firstTrend = FIXTURE_WIN_LOSS_RESULT.objection_trends[0];
      const personasEls = screen.getAllByTestId('objection-personas');
      expect(personasEls[0]).toHaveTextContent(firstTrend.personas_affected[0]);
    });

    it('renders objection text', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getAllByTestId('objection-trend').length).toBeGreaterThan(0)
      );
      const firstTrend = FIXTURE_WIN_LOSS_RESULT.objection_trends[0];
      expect(screen.getByText(firstTrend.objection)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Competitor involvement
  // ---------------------------------------------------------------------------

  describe('competitor involvement', () => {
    it('renders competitor rows', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getAllByTestId('competitor-involvement').length).toBeGreaterThan(0)
      );
    });

    it('renders correct number of competitor rows', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getAllByTestId('competitor-involvement').length).toBe(
          FIXTURE_WIN_LOSS_RESULT.competitor_involvement.length
        )
      );
    });

    it('renders win rate against each competitor', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getAllByTestId('competitor-win-rate').length).toBeGreaterThan(0)
      );
      const winRateEls = screen.getAllByTestId('competitor-win-rate');
      expect(winRateEls[0]).toHaveTextContent(
        `${FIXTURE_WIN_LOSS_RESULT.competitor_involvement[0].win_rate_against}%`
      );
    });

    it('renders competitor names', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getAllByTestId('competitor-involvement').length).toBeGreaterThan(0)
      );
      const firstComp = FIXTURE_WIN_LOSS_RESULT.competitor_involvement[0];
      expect(screen.getByText(firstComp.competitor_name)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Corrective actions
  // ---------------------------------------------------------------------------

  describe('corrective actions', () => {
    it('renders corrective action cards', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getAllByTestId('corrective-action').length).toBeGreaterThan(0)
      );
    });

    it('renders correct number of action cards', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getAllByTestId('corrective-action').length).toBe(
          FIXTURE_WIN_LOSS_RESULT.corrective_actions.length
        )
      );
    });

    it('renders action issue text', async () => {
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getAllByTestId('corrective-action').length).toBeGreaterThan(0)
      );
      const firstAction = FIXTURE_WIN_LOSS_RESULT.corrective_actions[0];
      expect(screen.getByText(firstAction.issue)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Analyze button
  // ---------------------------------------------------------------------------

  describe('analyze button', () => {
    it('analyze button triggers analysis and shows message', async () => {
      mockAnalyzeWinLoss.mockResolvedValue({ message: 'Analysis complete' });
      renderWinLoss();

      await waitFor(() =>
        expect(screen.getByTestId('analyze-button')).toBeInTheDocument()
      );

      fireEvent.click(screen.getByTestId('analyze-button'));

      await waitFor(() =>
        expect(screen.getByTestId('analyze-message')).toBeInTheDocument()
      );
      expect(screen.getByTestId('analyze-message')).toHaveTextContent('Analysis complete');
    });

    it('analyze button shows analyzing state while in progress', async () => {
      mockAnalyzeWinLoss.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ message: 'Done' }), 100))
      );
      renderWinLoss();

      await waitFor(() =>
        expect(screen.getByTestId('analyze-button')).toBeInTheDocument()
      );

      fireEvent.click(screen.getByTestId('analyze-button'));

      await waitFor(() =>
        expect(screen.getByTestId('analyze-button')).toBeDisabled()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  describe('empty state', () => {
    it('shows empty state when getWinLoss returns null', async () => {
      mockGetWinLoss.mockResolvedValue(null as unknown as typeof FIXTURE_WIN_LOSS_RESULT);
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getByText(/No win\/loss analysis yet/i)).toBeInTheDocument()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  describe('error state', () => {
    it('shows error banner when getWinLoss fails', async () => {
      mockGetWinLoss.mockRejectedValue(new Error('Failed to load win/loss analysis'));
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getByTestId('winloss-error')).toBeInTheDocument()
      );
      expect(screen.getByTestId('winloss-error')).toHaveTextContent(
        'Failed to load win/loss analysis'
      );
    });

    it('shows error message on unknown error type', async () => {
      mockGetWinLoss.mockRejectedValue('string error');
      renderWinLoss();
      await waitFor(() =>
        expect(screen.getByTestId('winloss-error')).toBeInTheDocument()
      );
    });
  });
});
