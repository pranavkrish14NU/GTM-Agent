/**
 * Shared TypeScript types used across the BOBA frontend.
 */

// ---------------------------------------------------------------------------
// RBAC
// ---------------------------------------------------------------------------

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export interface Workspace {
  id: string;
  name: string;
  plan: 'starter' | 'pro' | 'enterprise';
  logoUrl?: string;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  /**
   * Explicit role allowlist — only users whose role appears here see the item.
   * Omit to make the item visible to all authenticated users.
   * Replaces the former minRole field (hierarchy-based) with an explicit set.
   */
  requiredRoles?: UserRole[];
  /** One level of nested sub-navigation items */
  children?: NavItem[];
  badge?: number;
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

export type DriveConnectionStatus = 'connected' | 'disconnected' | 'syncing' | 'error';

export interface DriveConnection {
  id: string;
  workspaceId: string;
  email: string;
  status: DriveConnectionStatus;
  lastSyncedAt?: string;
  filesIndexed?: number;
}

// ---------------------------------------------------------------------------
// Document / Chunk
// ---------------------------------------------------------------------------

export interface Document {
  id: string;
  workspaceId: string;
  driveFileId: string;
  title: string;
  mimeType: string;
  lastSyncedAt: string;
  freshnessScore: number;
}

// ---------------------------------------------------------------------------
// Insight
// ---------------------------------------------------------------------------

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface Insight {
  id: string;
  workspaceId: string;
  type: 'brand' | 'competitor' | 'persona' | 'win-loss' | 'campaign';
  title: string;
  summary: string;
  confidence: ConfidenceLevel;
  sourceDocs: string[];
  recommendation?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Component Library — MetricStory
// ---------------------------------------------------------------------------

export interface MetricStory {
  id: string;
  /** The primary metric or KPI headline */
  metric: string;
  /** What the metric means in business context */
  meaning: string;
  /** Supporting data points / evidence sentences */
  evidence: string[];
  /** Strategic recommendation derived from the metric */
  recommendation: string;
  /** Concrete next action for the user to take */
  nextAction: string;
  /** e.g. "Q2 2026", "Last 30 days" */
  period?: string;
  workspaceId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Component Library — DataStory
// ---------------------------------------------------------------------------

export interface DataPoint {
  label: string;
  value: number;
}

export type ChartType = 'bar' | 'line' | 'number';

export interface DataStory {
  id: string;
  title: string;
  /** Narrative context for the visualised data */
  narrative: string;
  chartType?: ChartType;
  dataPoints?: DataPoint[];
  workspaceId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Component Library — SyncHealth
// ---------------------------------------------------------------------------

export interface FreshnessDistribution {
  /** Files with freshnessScore ≥ 80 */
  fresh: number;
  /** Files with freshnessScore 40–79 */
  stale: number;
  /** Files with freshnessScore < 40 */
  outdated: number;
}

export interface SyncHealthData {
  connection: DriveConnection;
  freshnessDistribution: FreshnessDistribution;
  totalFiles: number;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchResultType = 'document' | 'insight' | 'content';

export interface SearchResult {
  id: string;
  title: string;
  type: SearchResultType;
  /** Short excerpt or description for the result row */
  excerpt?: string;
  /** Route to navigate to when the result is selected */
  path: string;
}

export interface SearchResultGroup {
  /** Module label shown as a group header in the dropdown */
  module: 'Documents' | 'Insights' | 'Content';
  results: SearchResult[];
}

// ---------------------------------------------------------------------------
// UI state
// ---------------------------------------------------------------------------

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T> {
  data: T | null;
  status: LoadingState;
  error: string | null;
}
