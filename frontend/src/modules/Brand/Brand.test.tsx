/**
 * Unit tests for Brand Intelligence page.
 *
 * All API functions are mocked — no network calls made.
 *
 * Coverage:
 *   Page structure:
 *   ✓ renders page heading
 *   ✓ shows loading skeleton while data loads
 *   ✓ shows analyze button after data loads
 *
 *   Consistency gauge:
 *   ✓ renders consistency score gauge with correct value
 *   ✓ shows document count
 *
 *   Voice profile:
 *   ✓ renders voice profile section
 *   ✓ shows tone label
 *   ✓ shows vocabulary patterns
 *   ✓ shows style characteristics
 *
 *   Positioning themes:
 *   ✓ renders all positioning themes
 *   ✓ each theme shows name, description, confidence
 *
 *   Drift alerts:
 *   ✓ renders drift alerts list
 *   ✓ each alert shows document title, drift score, deviation types, suggestion
 *   ✓ shows no-drift message when alerts array is empty
 *   ✓ shows drift count badge when alerts exist
 *
 *   Source citations:
 *   ✓ renders source list
 *   ✓ each source shows filename and relevance score
 *
 *   Analyze action:
 *   ✓ clicking analyze button triggers analyzeBrand then reloads data
 *   ✓ shows analyzing state while in progress
 *   ✓ shows success message after analysis completes
 *
 *   Empty state:
 *   ✓ shows empty state when no analysis exists
 *
 *   Error state:
 *   ✓ shows error banner when data load fails
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Brand from './index.js';
import * as api from './api.js';
import {
  FIXTURE_BRAND_ANALYSIS,
  FIXTURE_DRIFT_RESULT,
  FIXTURE_DRIFT_RESULT_EMPTY,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// Mock API module
// ---------------------------------------------------------------------------

vi.mock('./api.js', () => ({
  getBrandAnalysis: vi.fn(),
  getBrandDrift: vi.fn(),
  analyzeBrand: vi.fn(),
}));

function renderBrand() {
  return render(
    <MemoryRouter>
      <Brand />
    </MemoryRouter>,
  );
}

function setupDefaultMocks() {
  vi.mocked(api.getBrandAnalysis).mockResolvedValue(FIXTURE_BRAND_ANALYSIS);
  vi.mocked(api.getBrandDrift).mockResolvedValue(FIXTURE_DRIFT_RESULT);
  vi.mocked(api.analyzeBrand).mockResolvedValue({ message: 'Brand analysis complete' });
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
    renderBrand();
    expect(screen.getByTestId('brand-heading')).toBeInTheDocument();
    expect(screen.getByTestId('brand-heading').textContent).toContain('Brand Intelligence');
  });

  it('shows loading skeleton while data loads', () => {
    vi.mocked(api.getBrandAnalysis).mockReturnValue(new Promise(() => {}));
    vi.mocked(api.getBrandDrift).mockReturnValue(new Promise(() => {}));
    renderBrand();
    expect(screen.getByTestId('brand-loading')).toBeInTheDocument();
  });

  it('shows analyze button after data loads', async () => {
    renderBrand();
    await waitFor(() => expect(screen.getByTestId('analyze-button')).toBeInTheDocument());
  });

  it('shows last-analyzed timestamp when data has last_analyzed_at', async () => {
    renderBrand();
    await waitFor(() => expect(screen.getByTestId('last-analyzed')).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// Consistency gauge
// ---------------------------------------------------------------------------

describe('Consistency gauge', () => {
  it('renders consistency gauge with correct score value', async () => {
    renderBrand();
    await waitFor(() => {
      expect(screen.getByTestId('consistency-gauge')).toBeInTheDocument();
      expect(screen.getByTestId('consistency-score-value').textContent).toBe('76');
    });
  });

  it('shows document count below gauge', async () => {
    renderBrand();
    await waitFor(() => {
      expect(screen.getByTestId('document-count').textContent).toContain('14');
    });
  });

  it('renders gauge for low-score analysis', async () => {
    vi.mocked(api.getBrandAnalysis).mockResolvedValue({
      ...FIXTURE_BRAND_ANALYSIS,
      consistency_score: 32,
    });
    renderBrand();
    await waitFor(() => {
      expect(screen.getByTestId('consistency-score-value').textContent).toBe('32');
    });
  });
});

// ---------------------------------------------------------------------------
// Voice profile
// ---------------------------------------------------------------------------

describe('Voice profile', () => {
  it('renders voice profile section', async () => {
    renderBrand();
    await waitFor(() => expect(screen.getByTestId('voice-profile')).toBeInTheDocument());
  });

  it('shows the detected tone', async () => {
    renderBrand();
    await waitFor(() => {
      const toneEl = screen.getByTestId('voice-tone');
      expect(toneEl.textContent).toContain('Formal');
    });
  });

  it('shows vocabulary patterns', async () => {
    renderBrand();
    await waitFor(() => {
      const patternsEl = screen.getByTestId('vocabulary-patterns');
      // Fixture has ['enterprise', 'strategic', 'optimize', 'leverage', 'solution']
      expect(patternsEl.textContent).toContain('enterprise');
      expect(patternsEl.textContent).toContain('strategic');
    });
  });

  it('shows style characteristics', async () => {
    renderBrand();
    await waitFor(() => {
      const charEl = screen.getByTestId('style-characteristics');
      expect(charEl.textContent).toContain('Professional tone');
    });
  });
});

// ---------------------------------------------------------------------------
// Positioning themes
// ---------------------------------------------------------------------------

describe('Positioning themes', () => {
  it('renders all positioning theme cards', async () => {
    renderBrand();
    await waitFor(() => {
      const themeCards = screen.getAllByTestId('theme-card');
      // Fixture has 3 themes
      expect(themeCards).toHaveLength(3);
    });
  });

  it('each theme card shows name and confidence', async () => {
    renderBrand();
    await waitFor(() => {
      expect(screen.getByText('AI-Powered')).toBeInTheDocument();
      expect(screen.getByText('Enterprise Scale')).toBeInTheDocument();
    });
  });

  it('theme cards show confidence score', async () => {
    renderBrand();
    await waitFor(() => {
      const badges = screen.getAllByTestId('theme-confidence');
      expect(badges[0]!.textContent).toContain('85');
    });
  });
});

// ---------------------------------------------------------------------------
// Drift alerts
// ---------------------------------------------------------------------------

describe('Drift alerts', () => {
  it('renders drift alert items', async () => {
    renderBrand();
    await waitFor(() => {
      const alerts = screen.getAllByTestId('drift-alert');
      // Fixture has 2 alerts
      expect(alerts).toHaveLength(2);
    });
  });

  it('each drift alert shows document title', async () => {
    renderBrand();
    await waitFor(() => {
      expect(screen.getByText('Q1 Sales Deck.pdf')).toBeInTheDocument();
      expect(screen.getByText('Product One-Pager.docx')).toBeInTheDocument();
    });
  });

  it('each drift alert shows drift score', async () => {
    renderBrand();
    await waitFor(() => {
      const scores = screen.getAllByTestId('drift-score');
      expect(scores[0]!.textContent).toContain('78');
    });
  });

  it('each drift alert shows deviation types', async () => {
    renderBrand();
    await waitFor(() => {
      const types = screen.getAllByTestId('deviation-types');
      expect(types[0]!.textContent).toContain('tone mismatch');
    });
  });

  it('each drift alert shows correction suggestion', async () => {
    renderBrand();
    await waitFor(() => {
      const suggestions = screen.getAllByTestId('correction-suggestion');
      expect(suggestions[0]!.textContent).toContain('Align tone');
    });
  });

  it('shows drift count badge when alerts exist', async () => {
    renderBrand();
    await waitFor(() => {
      expect(screen.getByTestId('drift-count').textContent).toBe('2');
    });
  });

  it('shows no-drift message when alerts array is empty', async () => {
    vi.mocked(api.getBrandDrift).mockResolvedValue(FIXTURE_DRIFT_RESULT_EMPTY);
    renderBrand();
    await waitFor(() => {
      expect(screen.getByTestId('no-drift')).toBeInTheDocument();
      expect(screen.getByTestId('no-drift').textContent).toContain('No brand drift detected');
    });
  });
});

// ---------------------------------------------------------------------------
// Source citations
// ---------------------------------------------------------------------------

describe('Source citations', () => {
  it('renders source list', async () => {
    renderBrand();
    await waitFor(() => {
      expect(screen.getByTestId('sources-list')).toBeInTheDocument();
    });
  });

  it('renders each source with filename', async () => {
    renderBrand();
    await waitFor(() => {
      const items = screen.getAllByTestId('source-item');
      expect(items).toHaveLength(2);
      expect(screen.getByText('Brand Guidelines 2026.pdf')).toBeInTheDocument();
    });
  });

  it('each source shows relevance score', async () => {
    renderBrand();
    await waitFor(() => {
      const relevanceEls = screen.getAllByTestId('source-relevance');
      expect(relevanceEls[0]!.textContent).toContain('95%');
    });
  });
});

// ---------------------------------------------------------------------------
// Analyze action
// ---------------------------------------------------------------------------

describe('Analyze button', () => {
  it('clicking analyze triggers analyzeBrand then reloads data', async () => {
    renderBrand();
    await waitFor(() => expect(screen.getByTestId('analyze-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('analyze-button'));

    await waitFor(() => {
      expect(api.analyzeBrand).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      // loadData called again after analysis — getBrandAnalysis should have been called twice
      expect(api.getBrandAnalysis).toHaveBeenCalledTimes(2);
    });
  });

  it('shows analyzing state while in progress', async () => {
    vi.mocked(api.analyzeBrand).mockReturnValue(new Promise(() => {}));
    renderBrand();
    await waitFor(() => expect(screen.getByTestId('analyze-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('analyze-button'));

    await waitFor(() => {
      expect(screen.getByTestId('analyze-button').textContent).toContain('Analyzing');
      expect(screen.getByTestId('analyze-button')).toBeDisabled();
    });
  });

  it('shows success message after analysis completes', async () => {
    renderBrand();
    await waitFor(() => expect(screen.getByTestId('analyze-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('analyze-button'));

    await waitFor(() => {
      expect(screen.getByTestId('analyze-message').textContent).toContain('Brand analysis complete');
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('Empty state', () => {
  it('shows empty state when no analysis exists', async () => {
    vi.mocked(api.getBrandAnalysis).mockResolvedValue(null);
    vi.mocked(api.getBrandDrift).mockResolvedValue(FIXTURE_DRIFT_RESULT_EMPTY);
    renderBrand();
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });

  it('empty state does not show gauge or voice profile', async () => {
    vi.mocked(api.getBrandAnalysis).mockResolvedValue(null);
    vi.mocked(api.getBrandDrift).mockResolvedValue(FIXTURE_DRIFT_RESULT_EMPTY);
    renderBrand();
    await waitFor(() => {
      expect(screen.queryByTestId('consistency-gauge')).not.toBeInTheDocument();
      expect(screen.queryByTestId('voice-profile')).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('Error state', () => {
  it('shows error banner when data load fails', async () => {
    vi.mocked(api.getBrandAnalysis).mockRejectedValue(new Error('Network error'));
    renderBrand();
    await waitFor(() => {
      expect(screen.getByTestId('brand-error')).toBeInTheDocument();
      expect(screen.getByTestId('brand-error').textContent).toContain('Network error');
    });
  });

  it('does not show gauge or profile when error occurs', async () => {
    vi.mocked(api.getBrandAnalysis).mockRejectedValue(new Error('Server error'));
    renderBrand();
    await waitFor(() => {
      expect(screen.queryByTestId('consistency-gauge')).not.toBeInTheDocument();
    });
  });
});
