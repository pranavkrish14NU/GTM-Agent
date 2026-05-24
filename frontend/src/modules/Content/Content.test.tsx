/**
 * Unit tests for Content Studio page.
 *
 * All API functions are mocked — no network calls made.
 *
 * Coverage:
 *   Page structure:
 *   ✓ renders page heading
 *   ✓ shows generation form
 *
 *   Generation form:
 *   ✓ renders content type select
 *   ✓ renders tone select
 *   ✓ renders length select
 *   ✓ renders channel select
 *   ✓ renders topic input
 *   ✓ renders target persona input
 *   ✓ generate button disabled when topic is empty
 *   ✓ generate button enabled when topic has content
 *
 *   Content generation:
 *   ✓ typing topic and clicking generate calls generateContent
 *   ✓ shows loading state while generating
 *   ✓ shows ContentEditor after generation completes
 *   ✓ content editor shows brand voice score
 *   ✓ content editor shows persona fit score
 *   ✓ content editor shows content title
 *   ✓ content editor shows content body
 *
 *   Source citations:
 *   ✓ shows source items below content
 *
 *   Regenerate:
 *   ✓ clicking regenerate calls generateContent again with same params
 *
 *   Refine:
 *   ✓ clicking refine shows refine panel
 *   ✓ submitting refine calls refineContent
 *   ✓ refine panel hides after successful refine
 *
 *   Save-to-Drive:
 *   ✓ clicking save-to-drive opens folder picker
 *   ✓ folder picker shows drive folder items
 *   ✓ selecting a folder and confirming calls saveContentToDrive
 *   ✓ shows save success message after save completes
 *
 *   Drafts:
 *   ✓ renders draft items from getDrafts
 *   ✓ shows no-drafts message when list is empty
 *
 *   Error state:
 *   ✓ shows error banner when generation fails
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Content from './index.js';
import * as api from './api.js';
import {
  FIXTURE_GENERATED_CONTENT,
  FIXTURE_REFINED_CONTENT,
  FIXTURE_DRAFTS_RESULT,
  FIXTURE_DRAFTS_RESULT_EMPTY,
  FIXTURE_DRIVE_FOLDERS,
  FIXTURE_SAVE_RESULT,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// Mock API module
// ---------------------------------------------------------------------------

vi.mock('./api.js', () => ({
  generateContent: vi.fn(),
  refineContent: vi.fn(),
  getDrafts: vi.fn(),
  getDriveFolders: vi.fn(),
  saveContentToDrive: vi.fn(),
}));

function renderContent() {
  return render(
    <MemoryRouter>
      <Content />
    </MemoryRouter>,
  );
}

function setupDefaultMocks() {
  vi.mocked(api.generateContent).mockResolvedValue(FIXTURE_GENERATED_CONTENT);
  vi.mocked(api.refineContent).mockResolvedValue(FIXTURE_REFINED_CONTENT);
  vi.mocked(api.getDrafts).mockResolvedValue(FIXTURE_DRAFTS_RESULT);
  vi.mocked(api.getDriveFolders).mockResolvedValue(FIXTURE_DRIVE_FOLDERS);
  vi.mocked(api.saveContentToDrive).mockResolvedValue(FIXTURE_SAVE_RESULT);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

// Helper: fills in topic and triggers generate
async function generateWithTopic(topic = 'How AI transforms B2B content') {
  await waitFor(() => expect(screen.getByTestId('topic-input')).toBeInTheDocument());
  fireEvent.change(screen.getByTestId('topic-input'), { target: { value: topic } });
  fireEvent.click(screen.getByTestId('generate-button'));
}

// ---------------------------------------------------------------------------
// Page structure
// ---------------------------------------------------------------------------

describe('Page structure', () => {
  it('renders page heading', async () => {
    renderContent();
    expect(screen.getByTestId('content-heading')).toBeInTheDocument();
    expect(screen.getByTestId('content-heading').textContent).toContain('Content Studio');
  });

  it('shows generation form', async () => {
    renderContent();
    expect(screen.getByTestId('generation-form')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Generation form
// ---------------------------------------------------------------------------

describe('Generation form', () => {
  it('renders content type select', () => {
    renderContent();
    expect(screen.getByTestId('content-type-select')).toBeInTheDocument();
  });

  it('renders tone select', () => {
    renderContent();
    expect(screen.getByTestId('tone-select')).toBeInTheDocument();
  });

  it('renders length select', () => {
    renderContent();
    expect(screen.getByTestId('length-select')).toBeInTheDocument();
  });

  it('renders channel select', () => {
    renderContent();
    expect(screen.getByTestId('channel-select')).toBeInTheDocument();
  });

  it('renders topic input', () => {
    renderContent();
    expect(screen.getByTestId('topic-input')).toBeInTheDocument();
  });

  it('renders target persona input', () => {
    renderContent();
    expect(screen.getByTestId('persona-select')).toBeInTheDocument();
  });

  it('generate button is disabled when topic is empty', () => {
    renderContent();
    expect(screen.getByTestId('generate-button')).toBeDisabled();
  });

  it('generate button enabled when topic has content', () => {
    renderContent();
    fireEvent.change(screen.getByTestId('topic-input'), {
      target: { value: 'Some topic text' },
    });
    expect(screen.getByTestId('generate-button')).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Content generation
// ---------------------------------------------------------------------------

describe('Content generation', () => {
  it('clicking generate calls generateContent', async () => {
    renderContent();
    await generateWithTopic();
    await waitFor(() => {
      expect(api.generateContent).toHaveBeenCalledTimes(1);
    });
  });

  it('shows loading state while generating', async () => {
    vi.mocked(api.generateContent).mockReturnValue(new Promise(() => {}));
    renderContent();
    fireEvent.change(screen.getByTestId('topic-input'), {
      target: { value: 'Test topic' },
    });
    fireEvent.click(screen.getByTestId('generate-button'));
    await waitFor(() => {
      expect(screen.getByTestId('generate-loading')).toBeInTheDocument();
    });
  });

  it('shows ContentEditor after generation completes', async () => {
    renderContent();
    await generateWithTopic();
    await waitFor(() => {
      expect(screen.getByTestId('content-editor')).toBeInTheDocument();
    });
  });

  it('content editor shows brand voice score', async () => {
    renderContent();
    await generateWithTopic();
    await waitFor(() => {
      expect(screen.getByTestId('brand-voice-score').textContent).toContain('87');
    });
  });

  it('content editor shows persona fit score', async () => {
    renderContent();
    await generateWithTopic();
    await waitFor(() => {
      expect(screen.getByTestId('persona-fit-score').textContent).toContain('79');
    });
  });

  it('content editor shows content title', async () => {
    renderContent();
    await generateWithTopic();
    await waitFor(() => {
      expect(screen.getByTestId('content-title').textContent).toContain(
        'How AI Is Transforming B2B Content Marketing',
      );
    });
  });

  it('content body is displayed', async () => {
    renderContent();
    await generateWithTopic();
    await waitFor(() => {
      const body = screen.getByTestId('content-body');
      expect(body.textContent).toContain('AI-native content operations');
    });
  });
});

// ---------------------------------------------------------------------------
// Source citations
// ---------------------------------------------------------------------------

describe('Source citations', () => {
  it('shows source items below content', async () => {
    renderContent();
    await generateWithTopic();
    await waitFor(() => {
      const items = screen.getAllByTestId('source-item');
      // Fixture has 2 sources
      expect(items).toHaveLength(2);
      expect(screen.getByText('Brand Guidelines 2026.pdf')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Regenerate
// ---------------------------------------------------------------------------

describe('Regenerate', () => {
  it('clicking regenerate calls generateContent again', async () => {
    renderContent();
    await generateWithTopic();
    await waitFor(() => expect(screen.getByTestId('regenerate-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('regenerate-button'));

    await waitFor(() => {
      expect(api.generateContent).toHaveBeenCalledTimes(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Refine
// ---------------------------------------------------------------------------

describe('Refine', () => {
  it('clicking refine shows refine panel', async () => {
    renderContent();
    await generateWithTopic();
    await waitFor(() => expect(screen.getByTestId('refine-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('refine-button'));

    await waitFor(() => {
      expect(screen.getByTestId('refine-panel')).toBeInTheDocument();
      expect(screen.getByTestId('refine-input')).toBeInTheDocument();
    });
  });

  it('submitting refine calls refineContent', async () => {
    renderContent();
    await generateWithTopic();
    await waitFor(() => expect(screen.getByTestId('refine-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('refine-button'));
    await waitFor(() => expect(screen.getByTestId('refine-input')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('refine-input'), {
      target: { value: 'Make it shorter and add a CTA' },
    });
    fireEvent.click(screen.getByTestId('submit-refine-button'));

    await waitFor(() => {
      expect(api.refineContent).toHaveBeenCalledTimes(1);
      expect(api.refineContent).toHaveBeenCalledWith({
        content_id: FIXTURE_GENERATED_CONTENT.content_id,
        instructions: 'Make it shorter and add a CTA',
      });
    });
  });

  it('refine panel hides after successful refine', async () => {
    renderContent();
    await generateWithTopic();
    await waitFor(() => expect(screen.getByTestId('refine-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('refine-button'));
    await waitFor(() => expect(screen.getByTestId('refine-input')).toBeInTheDocument());

    fireEvent.change(screen.getByTestId('refine-input'), {
      target: { value: 'Add more examples' },
    });
    fireEvent.click(screen.getByTestId('submit-refine-button'));

    await waitFor(() => {
      expect(screen.queryByTestId('refine-panel')).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Save-to-Drive
// ---------------------------------------------------------------------------

describe('Save-to-Drive', () => {
  it('clicking save-to-drive opens folder picker', async () => {
    renderContent();
    await generateWithTopic();
    await waitFor(() => expect(screen.getByTestId('save-to-drive-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('save-to-drive-button'));

    await waitFor(() => {
      expect(screen.getByTestId('folder-picker')).toBeInTheDocument();
    });
  });

  it('folder picker shows drive folder items', async () => {
    renderContent();
    await generateWithTopic();
    await waitFor(() => expect(screen.getByTestId('save-to-drive-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('save-to-drive-button'));

    await waitFor(() => {
      const folders = screen.getAllByTestId('drive-folder-item');
      // Fixture has 3 folders
      expect(folders).toHaveLength(3);
      expect(screen.getByText('📁 Marketing Content')).toBeInTheDocument();
    });
  });

  it('selecting a folder and confirming calls saveContentToDrive', async () => {
    renderContent();
    await generateWithTopic();
    await waitFor(() => expect(screen.getByTestId('save-to-drive-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('save-to-drive-button'));

    await waitFor(() => expect(screen.getAllByTestId('drive-folder-item')).toHaveLength(3));

    fireEvent.click(screen.getAllByTestId('drive-folder-item')[0]!);
    fireEvent.click(screen.getByTestId('confirm-save-button'));

    await waitFor(() => {
      expect(api.saveContentToDrive).toHaveBeenCalledTimes(1);
      expect(api.saveContentToDrive).toHaveBeenCalledWith({
        content_id: FIXTURE_GENERATED_CONTENT.content_id,
        folder_id: FIXTURE_DRIVE_FOLDERS[0]!.id,
      });
    });
  });

  it('shows save success message after save completes', async () => {
    renderContent();
    await generateWithTopic();
    await waitFor(() => expect(screen.getByTestId('save-to-drive-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('save-to-drive-button'));
    await waitFor(() => expect(screen.getAllByTestId('drive-folder-item')).toHaveLength(3));

    fireEvent.click(screen.getAllByTestId('drive-folder-item')[0]!);
    fireEvent.click(screen.getByTestId('confirm-save-button'));

    await waitFor(() => {
      expect(screen.getByTestId('save-success-message').textContent).toContain(
        'Content saved to Drive successfully',
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

describe('Drafts', () => {
  it('renders draft items from getDrafts', async () => {
    renderContent();
    await waitFor(() => {
      const draftItems = screen.getAllByTestId('draft-item');
      // Fixture has 2 drafts
      expect(draftItems).toHaveLength(2);
    });
  });

  it('shows no-drafts message when list is empty', async () => {
    vi.mocked(api.getDrafts).mockResolvedValue(FIXTURE_DRAFTS_RESULT_EMPTY);
    renderContent();
    await waitFor(() => {
      expect(screen.getByTestId('no-drafts')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('Error state', () => {
  it('shows error banner when generation fails', async () => {
    vi.mocked(api.generateContent).mockRejectedValue(new Error('Generation error'));
    renderContent();
    await generateWithTopic();
    await waitFor(() => {
      expect(screen.getByTestId('content-error')).toBeInTheDocument();
      expect(screen.getByTestId('content-error').textContent).toContain('Generation error');
    });
  });
});
