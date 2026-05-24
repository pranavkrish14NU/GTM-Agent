/**
 * Campaign Planner page — 📣 Campaign Planner
 *
 * Features:
 *   - Generation form: campaign name, objectives, target audience, channels, duration
 *   - CampaignBriefCard: executive summary, objectives, channels, content plan,
 *     email sequences, ad copy
 *   - Loading state while generating, error banner on failure
 *
 * API: POST /v1/campaigns/generate (generateCampaign)
 *      GET  /v1/campaigns          (getCampaigns)
 */

import { useState, useEffect, useCallback } from 'react';
import { CardSkeleton, EmptyState } from '../../components/common/index.js';
import { formatRelativeTime } from '../../utils/index.js';
import { generateCampaign, getCampaigns } from './api.js';
import type {
  CampaignBrief,
  CampaignsResult,
  GenerateCampaignParams,
  CampaignChannel,
} from './types.js';
import { CAMPAIGN_CHANNEL_LABELS } from './types.js';
import styles from './Campaigns.module.css';

// ---------------------------------------------------------------------------
// CampaignBriefCard
// ---------------------------------------------------------------------------

function CampaignBriefCard({ brief }: { brief: CampaignBrief }) {
  return (
    <div className={styles.briefCard} data-testid="campaign-brief-card">
      <div className={styles.briefCardHeader}>
        <div>
          <h2 className={styles.briefName} data-testid="brief-name">
            {brief.campaign_name}
          </h2>
          <p className={styles.briefMeta}>
            Created {formatRelativeTime(brief.created_at)}
            {brief.start_date && ` · ${brief.start_date} → ${brief.end_date ?? 'TBD'}`}
          </p>
        </div>
        <div className={styles.briefChannelTags} data-testid="brief-channels">
          {brief.channels.map((ch) => (
            <span key={ch} className={styles.briefChannelTag}>
              {CAMPAIGN_CHANNEL_LABELS[ch]}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.briefBody}>
        <div className={styles.briefSection}>
          <p className={styles.briefSectionLabel}>Executive Summary</p>
          <p className={styles.briefSummary} data-testid="brief-summary">
            {brief.executive_summary}
          </p>
        </div>

        <div className={styles.briefSection}>
          <p className={styles.briefSectionLabel}>Objectives</p>
          <ul className={styles.bulletList} data-testid="brief-objectives">
            {brief.objectives.map((obj) => (
              <li key={obj} className={styles.bulletItem}>{obj}</li>
            ))}
          </ul>
        </div>

        <div className={styles.briefSection}>
          <p className={styles.briefSectionLabel}>Target Audience</p>
          <p className={styles.briefSummary} data-testid="brief-audience">
            {brief.audience.segment}
            {brief.audience.estimated_size > 0 && (
              <span> · {brief.audience.estimated_size.toLocaleString()} estimated contacts</span>
            )}
          </p>
        </div>

        {brief.content_plan.length > 0 && (
          <div className={styles.briefSection}>
            <p className={styles.briefSectionLabel}>Content Plan</p>
            <table className={styles.contentPlanTable} data-testid="brief-content-plan">
              <thead>
                <tr><th>Week</th><th>Type</th><th>Topic</th><th>Channel</th></tr>
              </thead>
              <tbody>
                {brief.content_plan.map((item) => (
                  <tr key={`${item.week}-${item.topic}`} data-testid="content-plan-row">
                    <td>W{item.week}</td>
                    <td>{item.content_type}</td>
                    <td>{item.topic}</td>
                    <td>{CAMPAIGN_CHANNEL_LABELS[item.channel]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {brief.email_sequences.length > 0 && (
          <div className={styles.briefSection}>
            <p className={styles.briefSectionLabel}>Email Sequences</p>
            <div data-testid="brief-email-sequences">
              {brief.email_sequences.map((seq) => (
                <div key={seq.name} className={styles.emailSequence}>
                  <p className={styles.emailSequenceName}>{seq.name}</p>
                  <div className={styles.emailStepList}>
                    {seq.emails.map((step) => (
                      <div key={step.day} className={styles.emailStep} data-testid="email-step">
                        <span className={styles.emailStepDay}>Day {step.day}</span>
                        <div className={styles.emailStepContent}>
                          <p className={styles.emailStepSubject}>{step.subject}</p>
                          <p className={styles.emailStepPreview}>{step.preview}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {brief.ad_copy.length > 0 && (
          <div className={styles.briefSection}>
            <p className={styles.briefSectionLabel}>Ad Copy</p>
            <div className={styles.adCopyGrid} data-testid="brief-ad-copy">
              {brief.ad_copy.map((ad, i) => (
                <div key={i} className={styles.adCopyCard} data-testid="ad-copy-item">
                  <p className={styles.adCopyChannel}>{CAMPAIGN_CHANNEL_LABELS[ad.channel]}</p>
                  <p className={styles.adCopyHeadline}>{ad.headline}</p>
                  <p className={styles.adCopyBody}>{ad.body}</p>
                  <p className={styles.adCopyCta}>CTA: {ad.cta}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default form
// ---------------------------------------------------------------------------

const DEFAULT_PARAMS: GenerateCampaignParams = {
  campaign_name: '',
  objectives: '',
  target_audience: '',
  channels: ['email', 'linkedin'],
  duration_weeks: 8,
};

// ---------------------------------------------------------------------------
// Campaigns — main page
// ---------------------------------------------------------------------------

export default function Campaigns() {
  const [params, setParams] = useState<GenerateCampaignParams>(DEFAULT_PARAMS);
  const [result, setResult] = useState<CampaignsResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCampaigns()
      .then((data) => setResult(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load campaigns'))
      .finally(() => setIsLoading(false));
  }, []);

  const handleChannelToggle = useCallback((channel: CampaignChannel) => {
    setParams((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((c) => c !== channel)
        : [...prev.channels, channel],
    }));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!params.campaign_name.trim() || !params.objectives.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const brief = await generateCampaign(params);
      setResult((prev) => ({
        briefs: [brief, ...(prev?.briefs ?? [])],
        last_analyzed_at: brief.created_at,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Campaign generation failed');
    } finally {
      setIsGenerating(false);
    }
  }, [params]);

  const hasNoData = !isLoading && !error && (!result || result.briefs.length === 0);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle} data-testid="campaign-heading">
            📣 Campaign Planner
          </h1>
          <p className={styles.pageSubtitle}>
            Generate campaign briefs with audience targeting, channel planning, email sequences, and ad copy.
          </p>
        </div>
      </div>

      {error && (
        <p className={styles.errorBanner} role="alert" data-testid="campaign-error">
          {error}
        </p>
      )}

      {/* Generation form */}
      <div className={styles.campaignForm} data-testid="campaign-form">
        <p className={styles.formTitle}>Generate Campaign Brief</p>
        <div className={styles.formGrid}>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="campaign-name">Campaign Name</label>
            <input
              id="campaign-name"
              className={styles.formInput}
              type="text"
              placeholder="Q3 Pipeline Acceleration"
              value={params.campaign_name}
              onChange={(e) => setParams((p) => ({ ...p, campaign_name: e.target.value }))}
              data-testid="campaign-name-input"
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="duration">Duration (weeks)</label>
            <input
              id="duration"
              className={styles.formInput}
              type="number"
              min={1}
              max={52}
              value={params.duration_weeks}
              onChange={(e) =>
                setParams((p) => ({ ...p, duration_weeks: parseInt(e.target.value, 10) || 8 }))
              }
              data-testid="duration-input"
            />
          </div>

          <div className={`${styles.formField} ${styles.fullWidth}`}>
            <label className={styles.formLabel} htmlFor="objectives">Objectives</label>
            <textarea
              id="objectives"
              className={styles.formTextarea}
              placeholder="Generate 50 MQLs, accelerate pipeline by $2M…"
              value={params.objectives}
              onChange={(e) => setParams((p) => ({ ...p, objectives: e.target.value }))}
              data-testid="objectives-input"
            />
          </div>

          <div className={`${styles.formField} ${styles.fullWidth}`}>
            <label className={styles.formLabel} htmlFor="audience">Target Audience</label>
            <input
              id="audience"
              className={styles.formInput}
              type="text"
              placeholder="VP of Marketing at B2B SaaS (200-1000 employees)"
              value={params.target_audience}
              onChange={(e) => setParams((p) => ({ ...p, target_audience: e.target.value }))}
              data-testid="audience-input"
            />
          </div>

          <div className={`${styles.formField} ${styles.fullWidth}`}>
            <span className={styles.formLabel}>Channels</span>
            <div className={styles.channelCheckboxGroup}>
              {(Object.keys(CAMPAIGN_CHANNEL_LABELS) as CampaignChannel[]).map((ch) => (
                <label key={ch} className={styles.channelCheckbox}>
                  <input
                    type="checkbox"
                    checked={params.channels.includes(ch)}
                    onChange={() => handleChannelToggle(ch)}
                    data-testid={`channel-checkbox-${ch}`}
                  />
                  {CAMPAIGN_CHANNEL_LABELS[ch]}
                </label>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          className={styles.generateButton}
          onClick={() => void handleGenerate()}
          disabled={isGenerating || !params.campaign_name.trim() || !params.objectives.trim()}
          data-testid="generate-campaign-button"
        >
          {isGenerating ? '⟳ Generating…' : '✨ Generate Campaign Brief'}
        </button>
      </div>

      {isGenerating && (
        <div className={styles.loadingState} data-testid="campaign-loading">
          <span className={styles.loadingSpinner}>⟳</span>
          <span>Generating campaign brief…</span>
        </div>
      )}

      {isLoading && !isGenerating && (
        <div data-testid="campaign-loading-initial">
          <CardSkeleton />
        </div>
      )}

      {hasNoData && !isGenerating && (
        <EmptyState
          icon="📣"
          title="No campaigns yet"
          description="Fill in the form above and click 'Generate Campaign Brief' to create your first AI-powered campaign plan."
        />
      )}

      {!isLoading && !isGenerating && result && result.briefs.length > 0 && (
        <div className={styles.briefsList} data-testid="briefs-list">
          {result.briefs.map((brief) => (
            <CampaignBriefCard key={brief.brief_id} brief={brief} />
          ))}
        </div>
      )}
    </div>
  );
}
