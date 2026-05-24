/**
 * Test fixtures for Win/Loss Analysis module tests.
 */

import type {
  WinLossResult,
  DealPattern,
  ObjectionTrend,
  CompetitorInvolvement,
  CorrectiveAction,
} from './types.js';

// ---------------------------------------------------------------------------
// Deal patterns
// ---------------------------------------------------------------------------

export const FIXTURE_DEAL_PATTERNS: DealPattern[] = [
  {
    pattern: 'Multi-stakeholder deals with champion',
    frequency: 24,
    win_rate: 68,
    description: 'Deals where we had a strong internal champion and engaged multiple stakeholders had significantly higher close rates.',
  },
  {
    pattern: 'Competitive displacement from Klue',
    frequency: 12,
    win_rate: 42,
    description: 'Deals competing against Klue saw lower win rates — improved battlecards and counter-messaging needed.',
  },
  {
    pattern: 'Security review required',
    frequency: 18,
    win_rate: 55,
    description: 'Deals requiring a security review had average win rates but took 3 weeks longer to close.',
  },
];

// ---------------------------------------------------------------------------
// Objection trends
// ---------------------------------------------------------------------------

export const FIXTURE_OBJECTION_TRENDS: ObjectionTrend[] = [
  {
    objection: 'Price is too high for our current budget',
    frequency: 31,
    personas_affected: ['VP of Marketing', 'CFO'],
    deals_lost: 14,
    severity: 'high',
  },
  {
    objection: 'We already have a content tool in our stack',
    frequency: 22,
    personas_affected: ['VP of Marketing', 'Content Manager'],
    deals_lost: 9,
    severity: 'high',
  },
  {
    objection: 'Concerned about AI brand voice accuracy',
    frequency: 15,
    personas_affected: ['Brand Manager', 'VP of Marketing'],
    deals_lost: 4,
    severity: 'medium',
  },
];

// ---------------------------------------------------------------------------
// Competitor involvement
// ---------------------------------------------------------------------------

export const FIXTURE_COMPETITOR_INVOLVEMENT: CompetitorInvolvement[] = [
  {
    competitor_name: 'Klue',
    deals_involved: 18,
    win_rate_against: 39,
    threat_tier: 'critical',
  },
  {
    competitor_name: 'Crayon',
    deals_involved: 11,
    win_rate_against: 55,
    threat_tier: 'high',
  },
  {
    competitor_name: 'Showpad',
    deals_involved: 7,
    win_rate_against: 71,
    threat_tier: 'medium',
  },
];

// ---------------------------------------------------------------------------
// Corrective actions
// ---------------------------------------------------------------------------

export const FIXTURE_CORRECTIVE_ACTIONS: CorrectiveAction[] = [
  {
    issue: 'Low win rate against Klue in enterprise deals',
    recommended_action: 'Develop updated competitive battlecards highlighting AI-native differentiation. Focus on total cost of ownership and time-to-value advantages.',
    priority: 'high',
    confidence_level: 'high',
  },
  {
    issue: 'Price objection occurring in 31 deals',
    recommended_action: 'Create ROI calculator showing 40% reduction in content operations cost. Prepare CFO-targeted one-pager with 12-month payback analysis.',
    priority: 'high',
    confidence_level: 'medium',
  },
];

// ---------------------------------------------------------------------------
// Full result
// ---------------------------------------------------------------------------

export const FIXTURE_WIN_LOSS_RESULT: WinLossResult = {
  total_deals_analyzed: 74,
  overall_win_rate: 53,
  deal_patterns: FIXTURE_DEAL_PATTERNS,
  objection_trends: FIXTURE_OBJECTION_TRENDS,
  competitor_involvement: FIXTURE_COMPETITOR_INVOLVEMENT,
  corrective_actions: FIXTURE_CORRECTIVE_ACTIONS,
  sources: [
    { sourceFileId: 'file-wl-001', sourceFileName: 'CRM Deal Export Q1-Q2.csv', relevanceScore: 96 },
    { sourceFileId: 'file-wl-002', sourceFileName: 'Sales Call Recordings Analysis.pdf', relevanceScore: 84 },
  ],
  last_analyzed_at: new Date('2026-05-24T08:00:00Z').toISOString(),
};
