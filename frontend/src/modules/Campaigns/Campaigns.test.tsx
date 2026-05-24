/**
 * Campaigns module tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Campaigns from './index.js';
import {
  FIXTURE_CAMPAIGN_BRIEF,
  FIXTURE_CAMPAIGNS_RESULT,
  FIXTURE_CAMPAIGNS_RESULT_EMPTY,
} from './fixtures.js';

vi.mock('./api.js', () => ({
  generateCampaign: vi.fn(),
  getCampaigns: vi.fn(),
}));

import { generateCampaign, getCampaigns } from './api.js';

const mockGenerateCampaign = vi.mocked(generateCampaign);
const mockGetCampaigns = vi.mocked(getCampaigns);

function renderCampaigns() {
  return render(
    <MemoryRouter>
      <Campaigns />
    </MemoryRouter>
  );
}

describe('Campaigns page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCampaigns.mockResolvedValue(FIXTURE_CAMPAIGNS_RESULT_EMPTY);
  });

  // ---------------------------------------------------------------------------
  // Page structure
  // ---------------------------------------------------------------------------

  describe('page structure', () => {
    it('renders the page heading', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('campaign-heading')).toBeInTheDocument()
      );
      expect(screen.getByTestId('campaign-heading')).toHaveTextContent('Campaign Planner');
    });

    it('renders the generation form', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('campaign-form')).toBeInTheDocument()
      );
    });

    it('renders campaign name input', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('campaign-name-input')).toBeInTheDocument()
      );
    });

    it('renders objectives textarea', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('objectives-input')).toBeInTheDocument()
      );
    });

    it('renders audience input', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('audience-input')).toBeInTheDocument()
      );
    });

    it('renders duration input', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('duration-input')).toBeInTheDocument()
      );
    });

    it('renders channel checkboxes', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('channel-checkbox-email')).toBeInTheDocument()
      );
      expect(screen.getByTestId('channel-checkbox-linkedin')).toBeInTheDocument();
      expect(screen.getByTestId('channel-checkbox-website')).toBeInTheDocument();
      expect(screen.getByTestId('channel-checkbox-ads')).toBeInTheDocument();
      expect(screen.getByTestId('channel-checkbox-events')).toBeInTheDocument();
      expect(screen.getByTestId('channel-checkbox-content')).toBeInTheDocument();
    });

    it('renders the generate button', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('generate-campaign-button')).toBeInTheDocument()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Generate button state
  // ---------------------------------------------------------------------------

  describe('generate button state', () => {
    it('generate button is disabled when campaign name is empty', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('generate-campaign-button')).toBeInTheDocument()
      );
      expect(screen.getByTestId('generate-campaign-button')).toBeDisabled();
    });

    it('generate button is disabled when objectives are empty', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('campaign-name-input')).toBeInTheDocument()
      );
      fireEvent.change(screen.getByTestId('campaign-name-input'), {
        target: { value: 'Q3 Campaign' },
      });
      expect(screen.getByTestId('generate-campaign-button')).toBeDisabled();
    });

    it('generate button is enabled when both name and objectives are filled', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('campaign-name-input')).toBeInTheDocument()
      );
      fireEvent.change(screen.getByTestId('campaign-name-input'), {
        target: { value: 'Q3 Campaign' },
      });
      fireEvent.change(screen.getByTestId('objectives-input'), {
        target: { value: 'Generate 50 MQLs' },
      });
      expect(screen.getByTestId('generate-campaign-button')).not.toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // Form interaction
  // ---------------------------------------------------------------------------

  describe('form interaction', () => {
    it('toggles channel checkbox', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('channel-checkbox-website')).toBeInTheDocument()
      );
      const websiteCheckbox = screen.getByTestId('channel-checkbox-website');
      expect(websiteCheckbox).not.toBeChecked();
      fireEvent.click(websiteCheckbox);
      expect(websiteCheckbox).toBeChecked();
      fireEvent.click(websiteCheckbox);
      expect(websiteCheckbox).not.toBeChecked();
    });

    it('duration input accepts numeric input', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('duration-input')).toBeInTheDocument()
      );
      const durationInput = screen.getByTestId('duration-input');
      fireEvent.change(durationInput, { target: { value: '12' } });
      expect((durationInput as HTMLInputElement).value).toBe('12');
    });
  });

  // ---------------------------------------------------------------------------
  // Generating state
  // ---------------------------------------------------------------------------

  describe('generating state', () => {
    it('shows loading spinner while generating', async () => {
      mockGetCampaigns.mockResolvedValue(FIXTURE_CAMPAIGNS_RESULT_EMPTY);
      mockGenerateCampaign.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(FIXTURE_CAMPAIGN_BRIEF), 100))
      );

      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('campaign-name-input')).toBeInTheDocument()
      );

      fireEvent.change(screen.getByTestId('campaign-name-input'), {
        target: { value: 'Q3 Pipeline Acceleration' },
      });
      fireEvent.change(screen.getByTestId('objectives-input'), {
        target: { value: 'Generate 50 MQLs, accelerate pipeline by $2M' },
      });
      fireEvent.click(screen.getByTestId('generate-campaign-button'));

      await waitFor(() =>
        expect(screen.getByTestId('campaign-loading')).toBeInTheDocument()
      );

      expect(screen.getByTestId('generate-campaign-button')).toBeDisabled();
    });

    it('shows generated brief after successful generation', async () => {
      mockGetCampaigns.mockResolvedValue(FIXTURE_CAMPAIGNS_RESULT_EMPTY);
      mockGenerateCampaign.mockResolvedValue(FIXTURE_CAMPAIGN_BRIEF);

      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('campaign-name-input')).toBeInTheDocument()
      );

      fireEvent.change(screen.getByTestId('campaign-name-input'), {
        target: { value: FIXTURE_CAMPAIGN_BRIEF.campaign_name },
      });
      fireEvent.change(screen.getByTestId('objectives-input'), {
        target: { value: 'Generate MQLs' },
      });
      fireEvent.click(screen.getByTestId('generate-campaign-button'));

      await waitFor(() =>
        expect(screen.getByTestId('campaign-brief-card')).toBeInTheDocument()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Brief card rendering
  // ---------------------------------------------------------------------------

  describe('brief card rendering', () => {
    beforeEach(() => {
      mockGetCampaigns.mockResolvedValue(FIXTURE_CAMPAIGNS_RESULT);
    });

    it('renders brief name', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('brief-name')).toBeInTheDocument()
      );
      expect(screen.getByTestId('brief-name')).toHaveTextContent(
        FIXTURE_CAMPAIGN_BRIEF.campaign_name
      );
    });

    it('renders brief executive summary', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('brief-summary')).toBeInTheDocument()
      );
      expect(screen.getByTestId('brief-summary')).toHaveTextContent(
        FIXTURE_CAMPAIGN_BRIEF.executive_summary
      );
    });

    it('renders brief objectives', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('brief-objectives')).toBeInTheDocument()
      );
      const objectivesEl = screen.getByTestId('brief-objectives');
      expect(objectivesEl.querySelectorAll('li').length).toBeGreaterThan(0);
    });

    it('renders brief channels', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('brief-channels')).toBeInTheDocument()
      );
    });

    it('renders brief target audience', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('brief-audience')).toBeInTheDocument()
      );
    });

    it('renders content plan rows', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getAllByTestId('content-plan-row').length).toBeGreaterThan(0)
      );
    });

    it('renders email steps', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getAllByTestId('email-step').length).toBeGreaterThan(0)
      );
    });

    it('renders ad copy items', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getAllByTestId('ad-copy-item').length).toBeGreaterThan(0)
      );
    });

    it('renders briefs list when data is available', async () => {
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('briefs-list')).toBeInTheDocument()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  describe('empty state', () => {
    it('shows empty state when no campaigns exist', async () => {
      mockGetCampaigns.mockResolvedValue(FIXTURE_CAMPAIGNS_RESULT_EMPTY);
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByText(/No campaigns yet/i)).toBeInTheDocument()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  describe('error state', () => {
    it('shows error banner when getCampaigns fails', async () => {
      mockGetCampaigns.mockRejectedValue(new Error('Failed to load campaigns'));
      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('campaign-error')).toBeInTheDocument()
      );
      expect(screen.getByTestId('campaign-error')).toHaveTextContent('Failed to load campaigns');
    });

    it('shows error banner when generateCampaign fails', async () => {
      mockGetCampaigns.mockResolvedValue(FIXTURE_CAMPAIGNS_RESULT_EMPTY);
      mockGenerateCampaign.mockRejectedValue(new Error('Campaign generation failed'));

      renderCampaigns();
      await waitFor(() =>
        expect(screen.getByTestId('campaign-name-input')).toBeInTheDocument()
      );

      fireEvent.change(screen.getByTestId('campaign-name-input'), {
        target: { value: 'Q3 Campaign' },
      });
      fireEvent.change(screen.getByTestId('objectives-input'), {
        target: { value: 'Generate MQLs' },
      });
      fireEvent.click(screen.getByTestId('generate-campaign-button'));

      await waitFor(() =>
        expect(screen.getByTestId('campaign-error')).toBeInTheDocument()
      );
    });
  });
});
