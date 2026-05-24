/**
 * Test fixtures for Analytics Dashboard module tests.
 */

import type { AnalyticsDimension, AnalyticsResult, QbrExportResult } from './types.js';

// ---------------------------------------------------------------------------
// Dimensions (10+)
// ---------------------------------------------------------------------------

export const FIXTURE_DIMENSIONS: AnalyticsDimension[] = [
  {
    id: 'dim-001',
    dimension: 'Pipeline Velocity',
    icon: '⚡',
    score: 73,
    trend: 'improving',
    metric: '73 / 100',
    meaning: 'Deals are moving through the pipeline 18% faster than last quarter, driven by improved qualification and shorter security review cycles.',
    evidence: [
      'Average deal cycle reduced from 94 to 77 days',
      'Stage-2 to Stage-3 conversion rate up 12%',
      'Security review SLA met in 84% of deals (was 61%)',
    ],
    recommendation: 'Standardise the security review checklist across enterprise deals to sustain velocity gains.',
    next_action: 'Share updated security checklist template with AEs by end of week.',
    period: 'Q2 2026',
  },
  {
    id: 'dim-002',
    dimension: 'Content Alignment',
    icon: '📝',
    score: 81,
    trend: 'improving',
    metric: '81 / 100',
    meaning: 'Brand voice consistency across all outbound content is at an all-time high, with fewer tone deviations flagged in Drive documents.',
    evidence: [
      'Brand consistency score rose from 68 to 81',
      'Tone deviation alerts down 34% month-over-month',
      '12 new on-brand case studies published',
    ],
    recommendation: 'Expand brand guidelines to cover social short-form content where deviations are still common.',
    next_action: 'Draft social content guidelines and route through Brand team for approval.',
    period: 'Q2 2026',
  },
  {
    id: 'dim-003',
    dimension: 'Competitive Win Rate',
    icon: '⚔️',
    score: 48,
    trend: 'stable',
    metric: '48 / 100',
    meaning: 'Overall win rate against key competitors remains flat at 48%. Klue displacement deals remain a weak spot at 39% win rate.',
    evidence: [
      'Win rate against Crayon improved to 55%',
      'Win rate against Klue declined to 39% (was 42%)',
      '8 competitive displacement opportunities in pipeline',
    ],
    recommendation: 'Prioritise updated Klue battlecards focusing on AI-native differentiation and TCO advantages.',
    next_action: 'Schedule competitive battlecard sprint for next Monday.',
    period: 'Q2 2026',
  },
  {
    id: 'dim-004',
    dimension: 'ICP Penetration',
    icon: '🎯',
    score: 62,
    trend: 'improving',
    metric: '62 / 100',
    meaning: 'More deals are originating from ideal customer profiles (VP Marketing, B2B SaaS, 200–1000 employees), up from 51% last quarter.',
    evidence: [
      'ICP-matched deals up from 51% to 62% of pipeline',
      'Average ACV from ICP deals is 2.3× non-ICP',
      'LinkedIn ABM campaign generated 18 ICP-qualified MQLs',
    ],
    recommendation: 'Double down on LinkedIn ABM to sustain ICP pipeline momentum into Q3.',
    next_action: 'Increase LinkedIn ad spend by 20% targeting VP Marketing titles.',
    period: 'Q2 2026',
  },
  {
    id: 'dim-005',
    dimension: 'Persona Coverage',
    icon: '👤',
    score: 55,
    trend: 'stable',
    metric: '55 / 100',
    meaning: 'Content exists for primary buyer personas but CFO and Legal personas remain underserved, impacting late-stage approvals.',
    evidence: [
      'VP Marketing content coverage: 92%',
      'CFO content coverage: 34% — major gap',
      'Legal/Security content coverage: 41%',
    ],
    recommendation: 'Develop CFO-targeted ROI one-pager and Legal/Security FAQ to unblock late-stage deals.',
    next_action: 'Assign CFO ROI one-pager to content team with 2-week deadline.',
    period: 'Q2 2026',
  },
  {
    id: 'dim-006',
    dimension: 'Objection Handling',
    icon: '💬',
    score: 41,
    trend: 'declining',
    metric: '41 / 100',
    meaning: 'Price and budget objections are occurring in 42% of deals, up from 29% last quarter. Without reps armed with ROI data, deals are stalling.',
    evidence: [
      'Price objections in 31 of 74 analyzed deals',
      '14 deals lost primarily due to price objection',
      'ROI calculator usage by reps: only 12%',
    ],
    recommendation: 'Mandate ROI calculator usage in Stage-2 calls. Develop CFO payback analysis template.',
    next_action: 'Embed ROI calculator link in CRM deal view for Stage-2+ deals.',
    period: 'Q2 2026',
  },
  {
    id: 'dim-007',
    dimension: 'Campaign ROI',
    icon: '📣',
    score: 67,
    trend: 'improving',
    metric: '67 / 100',
    meaning: 'Q2 campaigns are generating qualified pipeline at $380 CPL, down from $520 in Q1, with email sequences outperforming paid ads.',
    evidence: [
      'CPL reduced from $520 to $380 quarter-over-quarter',
      'Email nurture sequence open rate: 34%',
      'Webinar campaign drove 22 MQL conversions',
    ],
    recommendation: 'Shift budget from underperforming paid ads to email + webinar to sustain cost efficiency.',
    next_action: 'Reallocate 15% of paid ad budget to email sequence production for Q3.',
    period: 'Q2 2026',
  },
  {
    id: 'dim-008',
    dimension: 'Deal Pattern Recognition',
    icon: '🔍',
    score: 70,
    trend: 'stable',
    metric: '70 / 100',
    meaning: 'Multi-stakeholder deals with a strong internal champion show 68% win rates. This pattern is now detected and flagged for all AEs.',
    evidence: [
      'Champion-led deals: 68% win rate vs 41% average',
      'Multi-stakeholder deals close 23 days faster',
      'CRM champion field completion rate: 74%',
    ],
    recommendation: 'Increase champion field completion to 100% via CRM enforcement to enable full pattern detection.',
    next_action: 'Set CRM validation rule requiring champion field by Stage-3.',
    period: 'Q2 2026',
  },
  {
    id: 'dim-009',
    dimension: 'Market Intelligence',
    icon: '🌍',
    score: 58,
    trend: 'improving',
    metric: '58 / 100',
    meaning: 'Analyst reports and market signals are being ingested weekly. Emerging topics around AI governance in content are gaining momentum.',
    evidence: [
      '14 analyst reports indexed this quarter',
      'AI governance topic sentiment: strongly positive',
      '3 market opportunity briefs generated for exec team',
    ],
    recommendation: 'Create an AI governance content series to capture emerging search demand.',
    next_action: 'Commission 2 thought leadership pieces on AI governance for content team.',
    period: 'Q2 2026',
  },
  {
    id: 'dim-010',
    dimension: 'Drive Content Freshness',
    icon: '📁',
    score: 64,
    trend: 'stable',
    metric: '64 / 100',
    meaning: 'Most Drive content is fresh and indexed. However, 18% of files are older than 6 months and may contain outdated competitive or product information.',
    evidence: [
      '82% of files synced within last 30 days',
      '18% of files flagged as stale (>6 months old)',
      'Sync frequency: daily across all connected folders',
    ],
    recommendation: 'Conduct quarterly content audit and archive or refresh stale files.',
    next_action: 'Schedule content review session with marketing team in the next 2 weeks.',
    period: 'Q2 2026',
  },
  {
    id: 'dim-011',
    dimension: 'Messaging Consistency',
    icon: '🗣️',
    score: 77,
    trend: 'improving',
    metric: '77 / 100',
    meaning: 'Core value propositions appear consistently across landing pages, decks, and outreach emails — up 9 points from last quarter.',
    evidence: [
      'Value prop consistency score: 77 (was 68)',
      'All sales decks updated with new positioning',
      'Email templates refreshed to match brand voice',
    ],
    recommendation: 'Extend consistency checks to partner marketing materials and third-party content.',
    next_action: 'Audit 5 key partner co-marketing assets against brand guidelines.',
    period: 'Q2 2026',
  },
];

// ---------------------------------------------------------------------------
// Full analytics result
// ---------------------------------------------------------------------------

export const FIXTURE_ANALYTICS_RESULT: AnalyticsResult = {
  dimensions: FIXTURE_DIMENSIONS,
  workspace_score: 63,
  last_analyzed_at: new Date('2026-05-24T06:00:00Z').toISOString(),
  sources: [
    { sourceFileId: 'src-001', sourceFileName: 'CRM Deal Export Q2.csv', relevanceScore: 95 },
    { sourceFileId: 'src-002', sourceFileName: 'Brand Guidelines v3.pdf', relevanceScore: 88 },
    { sourceFileId: 'src-003', sourceFileName: 'Q2 Campaign Performance.xlsx', relevanceScore: 82 },
  ],
};

export const FIXTURE_ANALYTICS_RESULT_EMPTY: AnalyticsResult = {
  dimensions: [],
  workspace_score: 0,
  last_analyzed_at: null,
  sources: [],
};

// ---------------------------------------------------------------------------
// QBR export result
// ---------------------------------------------------------------------------

export const FIXTURE_QBR_EXPORT: QbrExportResult = {
  download_url: 'https://storage.example.com/exports/qbr-q2-2026.pdf?token=abc123',
  expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
  file_name: 'BOBA-QBR-Q2-2026.pdf',
};
