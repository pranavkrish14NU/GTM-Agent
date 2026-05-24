/**
 * Unit tests for Competitor Intelligence page.
 *
 * All API functions are mocked — no network calls made.
 * The Drawer component is rendered alongside Competitors so drawer content is testable.
 *
 * Coverage:
 *   Page structure:
 *   ✓ renders page heading
 *   ✓ shows loading skeleton while data loads
 *   ✓ shows analyze button after data loads
 *   ✓ shows last-analyzed timestamp when data has last_analyzed_at
 *
 *   Competitor cards:
 *   ✓ renders all competitor cards
 *   ✓ each card shows competitor name
 *   ✓ each card shows threat score
 *   ✓ each card shows key differentiators
 *
 *   Battlecard drawer:
 *   ✓ clicking a competitor card opens the drawer
 *   ✓ drawer shows battlecard strengths
 *   ✓ drawer shows battlecard weaknesses
 *   ✓ drawer shows differentiation matrix rows
 *   ✓ drawer shows counter-messaging
 *
 *   Analyze action:
 *   ✓ clicking analyze triggers analyzeCompetitors then reloads data
 *   ✓ shows analyzing state while in progress
 *   ✓ shows success message after analysis completes
 *
 *   Empty state:
 *   ✓ shows empty state when result has no competitors
 *   ✓ shows empty state when result is null
 *
 *   Error state:
 *   ✓ shows error banner when data load fails
 *   ✓ does not show competitor grid when error occurs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DrawerContextProvider } from '../../context/DrawerContext.js';
import { Drawer } from '../../components/Drawer/index.js';
import Competitors from './index.js';
import * as api from './api.js';
import {
  FIXTURE_COMPETITORS_RESULT,
  FIXTURE_COMPETITORS_RESULT_EMPTY,
  FIXTURE_BATTLECARD,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// Mock API module
// ---------------------------------------------------------------------------

vi.mock('./api.js', () => ({
  getCompetitors: vi.fn(),
  getCompetitorBattlecard: vi.fn(),
  analyzeCompetitors: vi.fn(),
}));

function renderCompetitors() {
  return render(
    <MemoryRouter>
      <DrawerContextProvider>
        <Competitors />
        <Drawer />
      </DrawerContextProvider>
    </MemoryRouter>,
  );
}

function setupDefaultMocks() {
  vi.mocked(api.getCompetitors).mockResolvedValue(FIXTURE_COMPETITORS_RESULT);
  vi.mocked(api.getCompetitorBattlecard).mockResolvedValue(FIXTURE_BATTLECARD);
  vi.mocked(api.analyzeCompetitors).mockResolvedValue({ message: 'Competitor analysis complete' });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

// ---------------------------------------------------------------------------
// Page structure
// ---------------------------------------------------------------------------

describe('Page structure', () => {
  it('renders page heading', async () => {
    renderCompetitors();
    expect(screen.getByTestId('competitor-heading')).toBeInTheDocument();
    expect(screen.getByTestId('competitor-heading').textContent).toContain('Competitor Intelligence');
  });

  it('shows loading skeleton while data loads', () => {
    vi.mocked(api.getCompetitors).mockReturnValue(new Promise(() => {}));
    renderCompetitors();
    expect(screen.getByTestId('competitor-loading')).toBeInTheDocument();
  });

  it('shows analyze button after data loads', async () => {
    renderCompetitors();
    await waitFor(() => expect(screen.getByTestId('analyze-button')).toBeInTheDocument());
  });

  it('shows last-analyzed timestamp when data has last_analyzed_at', async () => {
    renderCompetitors();
    await waitFor(() => expect(screen.getByTestId('last-analyzed')).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// Competitor cards
// ---------------------------------------------------------------------------

describe('Competitor cards', () => {
  it('renders all competitor cards', async () => {
    renderCompetitors();
    await waitFor(() => {
      const cards = screen.getAllByTestId('competitor-card');
      // Fixture has 2 competitors
      expect(cards).toHaveLength(2);
    });
  });

  it('each card shows competitor name', async () => {
    renderCompetitors();
    await waitFor(() => {
      expect(screen.getByText('Klue')).toBeInTheDocument();
      expect(screen.getByText('Crayon')).toBeInTheDocument();
    });
  });

  it('first card shows correct threat score', async () => {
    renderCompetitors();
    await waitFor(() => {
      const scores = screen.getAllByTestId('threat-score');
      expect(scores[0]!.textContent).toContain('82');
    });
  });

  it('each card shows key differentiators', async () => {
    renderCompetitors();
    await waitFor(() => {
      const lists = screen.getAllByTestId('key-differentiators');
      // Fixture COMPETITOR_1 has 'Established brand recognition'
      expect(lists[0]!.textContent).toContain('Established brand recognition');
    });
  });
});

// ---------------------------------------------------------------------------
// Battlecard drawer
// ---------------------------------------------------------------------------

describe('Battlecard drawer', () => {
  it('clicking a competitor card opens the drawer', async () => {
    renderCompetitors();
    await waitFor(() => expect(screen.getAllByTestId('competitor-card')).toHaveLength(2));

    fireEvent.click(screen.getAllByTestId('competitor-card')[0]!);

    await waitFor(() => {
      // Battlecard content should appear after fetching
      expect(screen.getByTestId('battlecard-strengths')).toBeInTheDocument();
    });
  });

  it('battlecard shows strengths', async () => {
    renderCompetitors();
    await waitFor(() => expect(screen.getAllByTestId('competitor-card')).toHaveLength(2));

    fireEvent.click(screen.getAllByTestId('competitor-card')[0]!);

    await waitFor(() => {
      const strengths = screen.getByTestId('battlecard-strengths');
      expect(strengths.textContent).toContain('Category leader with strong brand recognition');
    });
  });

  it('battlecard shows weaknesses', async () => {
    renderCompetitors();
    await waitFor(() => expect(screen.getAllByTestId('competitor-card')).toHaveLength(2));

    fireEvent.click(screen.getAllByTestId('competitor-card')[0]!);

    await waitFor(() => {
      const weaknesses = screen.getByTestId('battlecard-weaknesses');
      expect(weaknesses.textContent).toContain('Not AI-native');
    });
  });

  it('battlecard shows differentiation matrix rows', async () => {
    renderCompetitors();
    await waitFor(() => expect(screen.getAllByTestId('competitor-card')).toHaveLength(2));

    fireEvent.click(screen.getAllByTestId('competitor-card')[0]!);

    await waitFor(() => {
      const rows = screen.getAllByTestId('battlecard-matrix-row');
      // Fixture has 3 matrix rows
      expect(rows).toHaveLength(3);
      expect(rows[0]!.textContent).toContain('AI-Native');
    });
  });

  it('battlecard shows counter-messaging', async () => {
    renderCompetitors();
    await waitFor(() => expect(screen.getAllByTestId('competitor-card')).toHaveLength(2));

    fireEvent.click(screen.getAllByTestId('competitor-card')[0]!);

    await waitFor(() => {
      const messages = screen.getAllByTestId('battlecard-counter-message');
      expect(messages).toHaveLength(2);
      expect(messages[0]!.textContent).toContain('Your competitor is cheaper');
    });
  });
});

// ---------------------------------------------------------------------------
// Analyze action
// ---------------------------------------------------------------------------

describe('Analyze button', () => {
  it('clicking analyze triggers analyzeCompetitors then reloads data', async () => {
    renderCompetitors();
    await waitFor(() => expect(screen.getByTestId('analyze-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('analyze-button'));

    await waitFor(() => {
      expect(api.analyzeCompetitors).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      // loadData called again after analysis
      expect(api.getCompetitors).toHaveBeenCalledTimes(2);
    });
  });

  it('shows analyzing state while in progress', async () => {
    vi.mocked(api.analyzeCompetitors).mockReturnValue(new Promise(() => {}));
    renderCompetitors();
    await waitFor(() => expect(screen.getByTestId('analyze-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('analyze-button'));

    await waitFor(() => {
      expect(screen.getByTestId('analyze-button').textContent).toContain('Analyzing');
      expect(screen.getByTestId('analyze-button')).toBeDisabled();
    });
  });

  it('shows success message after analysis completes', async () => {
    renderCompetitors();
    await waitFor(() => expect(screen.getByTestId('analyze-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('analyze-button'));

    await waitFor(() => {
      expect(screen.getByTestId('analyze-message').textContent).toContain(
        'Competitor analysis complete',
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('Empty state', () => {
  it('shows empty state when result has no competitors', async () => {
    vi.mocked(api.getCompetitors).mockResolvedValue(FIXTURE_COMPETITORS_RESULT_EMPTY);
    renderCompetitors();
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });

  it('shows empty state when result is null', async () => {
    vi.mocked(api.getCompetitors).mockResolvedValue(null);
    renderCompetitors();
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });

  it('empty state does not show competitor grid', async () => {
    vi.mocked(api.getCompetitors).mockResolvedValue(FIXTURE_COMPETITORS_RESULT_EMPTY);
    renderCompetitors();
    await waitFor(() => {
      expect(screen.queryByTestId('competitor-grid')).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('Error state', () => {
  it('shows error banner when data load fails', async () => {
    vi.mocked(api.getCompetitors).mockRejectedValue(new Error('Network error'));
    renderCompetitors();
    await waitFor(() => {
      expect(screen.getByTestId('competitor-error')).toBeInTheDocument();
      expect(screen.getByTestId('competitor-error').textContent).toContain('Network error');
    });
  });

  it('does not show competitor grid when error occurs', async () => {
    vi.mocked(api.getCompetitors).mockRejectedValue(new Error('Server error'));
    renderCompetitors();
    await waitFor(() => {
      expect(screen.queryByTestId('competitor-grid')).not.toBeInTheDocument();
    });
  });
});
