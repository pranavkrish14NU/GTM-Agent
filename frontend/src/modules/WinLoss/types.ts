/**
 * Win/Loss Analysis types — deal patterns, objection trends, competitor involvement,
 * corrective actions.
 *
 * Mirrors backend WO-038: Win/Loss Pattern Extraction and Trend Analysis.
 */

// ---------------------------------------------------------------------------
// Deal patterns
// ---------------------------------------------------------------------------

export interface DealPattern {
  pattern: string;
  /** Number of deals exhibiting this pattern */
  frequency: number;
  /** Win rate (0-100) for deals with this pattern */
  win_rate: number;
  description: string;
}

// ---------------------------------------------------------------------------
// Objection trends
// ---------------------------------------------------------------------------

export type Severity = 'high' | 'medium' | 'low';

export interface ObjectionTrend {
  objection: string;
  frequency: number;
  personas_affected: string[];
  deals_lost: number;
  severity: Severity;
}

// ---------------------------------------------------------------------------
// Competitor involvement
// ---------------------------------------------------------------------------

export type ThreatTier = 'critical' | 'high' | 'medium' | 'low';

export interface CompetitorInvolvement {
  competitor_name: string;
  deals_involved: number;
  /** Our win rate (0-100) when this competitor was in the deal */
  win_rate_against: number;
  threat_tier: ThreatTier;
}

// ---------------------------------------------------------------------------
// Corrective actions
// ---------------------------------------------------------------------------

export interface CorrectiveAction {
  issue: string;
  recommended_action: string;
  priority: Severity;
  confidence_level: Severity;
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface WinLossSource {
  sourceFileId: string;
  sourceFileName: string;
  relevanceScore: number;
}

// ---------------------------------------------------------------------------
// Top-level result
// ---------------------------------------------------------------------------

export interface WinLossResult {
  total_deals_analyzed: number;
  overall_win_rate: number;   // 0-100
  deal_patterns: DealPattern[];
  objection_trends: ObjectionTrend[];
  competitor_involvement: CompetitorInvolvement[];
  corrective_actions: CorrectiveAction[];
  sources: WinLossSource[];
  last_analyzed_at: string | null;
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

/**
 * Map a severity string to a display color for UI indicators.
 */
export function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case 'high':   return '#ef4444';
    case 'medium': return '#f59e0b';
    case 'low':    return '#22c55e';
  }
}

/**
 * Map a threat tier to a badge CSS color pair.
 */
export function getThreatTierStyle(tier: ThreatTier): { bg: string; text: string } {
  switch (tier) {
    case 'critical': return { bg: '#fee2e2', text: '#991b1b' };
    case 'high':     return { bg: '#fff7ed', text: '#9a3412' };
    case 'medium':   return { bg: '#fefce8', text: '#713f12' };
    case 'low':      return { bg: '#f0fdf4', text: '#166534' };
  }
}
