/**
 * Persona Intelligence types — persona cards, content gaps, buying intelligence.
 *
 * Mirrors backend WO-036: Persona Card Generation and Content Gap Analysis.
 */

// ---------------------------------------------------------------------------
// Source citations
// ---------------------------------------------------------------------------

export interface PersonaSource {
  sourceFileId: string;
  sourceFileName: string;
  relevanceScore: number;
}

// ---------------------------------------------------------------------------
// Content gap
// ---------------------------------------------------------------------------

export interface ContentGap {
  topic: string;
  /** Suggested format: 'Case Study' | 'Blog Post' | 'Whitepaper' | 'Demo' | 'One-Pager' */
  suggested_content_type: string;
  priority: 'high' | 'medium' | 'low';
}

// ---------------------------------------------------------------------------
// Core entity
// ---------------------------------------------------------------------------

export interface Persona {
  id: string;
  /** Job title / role label (e.g. "VP of Marketing") */
  role: string;
  goals: string[];
  pain_points: string[];
  buying_triggers: string[];
  objections: string[];
  content_gaps: ContentGap[];
  sources: PersonaSource[];
  last_updated: string | null;
}

export interface PersonasResult {
  personas: Persona[];
  total: number;
  last_analyzed_at: string | null;
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export type GapPriority = 'high' | 'medium' | 'low';

/** Map content gap priority to a display color */
export function getGapPriorityColor(priority: GapPriority): string {
  switch (priority) {
    case 'high':   return '#ef4444';
    case 'medium': return '#f59e0b';
    case 'low':    return '#94a3b8';
  }
}
