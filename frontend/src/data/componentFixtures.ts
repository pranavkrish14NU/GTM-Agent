/**
 * Component fixture data — committed as test fixtures per WO-026 acceptance criteria.
 *
 * ⚠️ MOCK DATA — never use in production pipelines.
 * These fixtures drive both Storybook-style documentation and unit tests.
 */

import type { Insight, MetricStory, DataStory, SyncHealthData } from '../types/index.js';

// ---------------------------------------------------------------------------
// InsightCard fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_INSIGHT_HIGH: Insight = {
  id: 'fixture-ins-001',
  workspaceId: 'ws-mock-001',
  type: 'brand',
  title: 'Brand voice is consistent across marketing materials',
  summary:
    'Analysis of 38 indexed documents shows 94% alignment with established brand guidelines. The 6% outliers are concentrated in partner co-marketing materials.',
  confidence: 'high',
  sourceDocs: ['doc-mock-001', 'doc-mock-002'],
  recommendation: 'Continue current voice guidelines. Schedule quarterly review of partner materials.',
  createdAt: new Date(Date.now() - 3_600_000).toISOString(),
};

export const FIXTURE_INSIGHT_MEDIUM: Insight = {
  id: 'fixture-ins-002',
  workspaceId: 'ws-mock-001',
  type: 'competitor',
  title: 'Salesforce positioning gap in AI-native GTM',
  summary:
    'Competitor materials lack an AI-first narrative. Strong differentiation opportunity exists over the next two quarters.',
  confidence: 'medium',
  sourceDocs: ['doc-mock-002'],
  recommendation: 'Emphasise AI-native architecture in the next 3 sales cycles.',
  createdAt: new Date(Date.now() - 7_200_000).toISOString(),
};

export const FIXTURE_INSIGHT_LOW: Insight = {
  id: 'fixture-ins-003',
  workspaceId: 'ws-mock-001',
  type: 'persona',
  title: 'VP Engineering personas may be under-represented in ICP docs',
  summary:
    'Current ICP documentation focuses heavily on CMO/VP Marketing personas. Technical buyer signals are thin.',
  confidence: 'low',
  sourceDocs: ['doc-mock-003'],
  recommendation: 'Commission technical buyer interviews; update ICP v4 before next campaign cycle.',
  createdAt: new Date(Date.now() - 86_400_000).toISOString(),
};

// ---------------------------------------------------------------------------
// MetricStoryCard fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_METRIC_STORY: MetricStory = {
  id: 'fixture-metric-001',
  workspaceId: 'ws-mock-001',
  metric: 'Pipeline Coverage: 3.2×',
  meaning:
    'Current qualified pipeline is 3.2× the quarterly revenue target — above the 3× threshold for predictable close.',
  evidence: [
    '47 active opportunities worth $2.4M across the funnel',
    'Average deal size increased 18% QoQ to $51K',
    'Stage 3+ conversion rate improved from 42% to 58% this quarter',
  ],
  recommendation:
    'Maintain current pipeline velocity. Shift focus to accelerating Stage 3+ deals rather than top-of-funnel sourcing.',
  nextAction: 'Review top 10 Stage 3 opportunities in weekly forecast call.',
  period: 'Q2 2026',
  createdAt: new Date(Date.now() - 3_600_000).toISOString(),
};

// ---------------------------------------------------------------------------
// DataStoryCard fixtures
// ---------------------------------------------------------------------------

export const FIXTURE_DATA_STORY: DataStory = {
  id: 'fixture-data-001',
  workspaceId: 'ws-mock-001',
  title: 'Brand Mention Share of Voice — Last 90 Days',
  narrative:
    'BOBA captured 28% share of voice in AI GTM conversations, up from 19% in the prior period. Growth is concentrated in LinkedIn and industry analyst blogs.',
  chartType: 'bar',
  dataPoints: [
    { label: 'BOBA', value: 28 },
    { label: 'Salesforce', value: 34 },
    { label: 'HubSpot', value: 22 },
    { label: 'Others', value: 16 },
  ],
  createdAt: new Date(Date.now() - 14_400_000).toISOString(),
};

export const FIXTURE_DATA_STORY_NUMBER: DataStory = {
  id: 'fixture-data-002',
  workspaceId: 'ws-mock-001',
  title: 'Documents Freshness Score',
  narrative: 'Average freshness score across all indexed documents is 72 out of 100.',
  chartType: 'number',
  dataPoints: [{ label: 'Avg Freshness', value: 72 }],
  createdAt: new Date(Date.now() - 3_600_000).toISOString(),
};

// ---------------------------------------------------------------------------
// SyncHealthPanel fixture
// ---------------------------------------------------------------------------

export const FIXTURE_SYNC_HEALTH: SyncHealthData = {
  connection: {
    id: 'conn-mock-001',
    workspaceId: 'ws-mock-001',
    email: 'maya@acme.com',
    status: 'connected',
    lastSyncedAt: new Date(Date.now() - 1_800_000).toISOString(), // 30 min ago
    filesIndexed: 142,
  },
  freshnessDistribution: {
    fresh: 89,    // score ≥ 80
    stale: 38,    // score 40–79
    outdated: 15, // score < 40
  },
  totalFiles: 142,
};

export const FIXTURE_SYNC_HEALTH_SYNCING: SyncHealthData = {
  ...FIXTURE_SYNC_HEALTH,
  connection: {
    ...FIXTURE_SYNC_HEALTH.connection,
    status: 'syncing',
    lastSyncedAt: new Date(Date.now() - 60_000).toISOString(),
  },
};

export const FIXTURE_SYNC_HEALTH_ERROR: SyncHealthData = {
  ...FIXTURE_SYNC_HEALTH,
  connection: {
    ...FIXTURE_SYNC_HEALTH.connection,
    status: 'error',
    lastSyncedAt: new Date(Date.now() - 7_200_000).toISOString(),
  },
};
