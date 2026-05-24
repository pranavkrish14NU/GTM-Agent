/// <reference types="vite/client" />
/**
 * Mock data for prototype/demo mode.
 *
 * ⚠️ MOCK DATA — clearly labeled. Never use in production pipelines.
 * Feature flag: VITE_USE_MOCK_DATA=true
 */

import type {
  User,
  Workspace,
  Document,
  Insight,
  DriveConnection,
  SearchResultGroup,
} from '../types/index.js';

export const MOCK_WORKSPACE: Workspace = {
  id: 'ws-mock-001',
  name: 'Acme Corp GTM',
  plan: 'pro',
};

export const MOCK_USER: User = {
  id: 'user-mock-001',
  email: 'maya@acme.com',
  displayName: 'Maya Chen',
  role: 'admin',
  workspaceId: 'ws-mock-001',
};

// ---------------------------------------------------------------------------
// Workspaces (for workspace switcher fixture)
// ---------------------------------------------------------------------------

/**
 * Mock workspace list — committed as test fixture per WO-025 acceptance criteria.
 * Represents workspaces available to the current user across teams.
 */
export const MOCK_WORKSPACES: Workspace[] = [
  { id: 'ws-mock-001', name: 'Acme Corp GTM', plan: 'pro' },
  { id: 'ws-mock-002', name: 'Demo Workspace', plan: 'starter' },
  { id: 'ws-mock-003', name: 'Sandbox', plan: 'starter' },
];

// ---------------------------------------------------------------------------
// Search results (for global search dropdown fixture)
// ---------------------------------------------------------------------------

/**
 * Mock search results grouped by module — committed as test fixture per WO-025 acceptance criteria.
 * In production these are returned by the search API; in mock mode they are
 * filtered client-side against this static list.
 */
export const MOCK_SEARCH_RESULTS: SearchResultGroup[] = [
  {
    module: 'Documents',
    results: [
      {
        id: 'doc-search-001',
        title: 'Q2 2026 Brand Positioning Framework',
        type: 'document',
        excerpt: 'Outlines tone, messaging pillars, and differentiation strategy.',
        path: '/drive',
      },
      {
        id: 'doc-search-002',
        title: 'Competitor Analysis — Salesforce vs BOBA',
        type: 'document',
        excerpt: 'Side-by-side feature comparison across 14 dimensions.',
        path: '/drive',
      },
      {
        id: 'doc-search-003',
        title: 'ICP Personas v3.1',
        type: 'document',
        excerpt: 'Ideal customer profiles for SMB and enterprise segments.',
        path: '/drive',
      },
    ],
  },
  {
    module: 'Insights',
    results: [
      {
        id: 'ins-search-001',
        title: 'Brand voice consistency across marketing materials',
        type: 'insight',
        excerpt: '94% alignment with brand guidelines across 38 indexed docs.',
        path: '/brand',
      },
      {
        id: 'ins-search-002',
        title: 'Salesforce positioning gap in AI-native GTM',
        type: 'insight',
        excerpt: 'Strong differentiation opportunity in AI-first narrative.',
        path: '/competitors',
      },
    ],
  },
  {
    module: 'Content',
    results: [
      {
        id: 'cnt-search-001',
        title: 'Q2 Email Campaign — Feature Launch',
        type: 'content',
        excerpt: 'Multi-touch sequence targeting mid-market prospects.',
        path: '/content',
      },
      {
        id: 'cnt-search-002',
        title: 'One-pager: AI-native GTM Platform',
        type: 'content',
        excerpt: 'Single-page sales asset for initial outreach.',
        path: '/content',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

export const MOCK_DRIVE_CONNECTION: DriveConnection = {
  id: 'conn-mock-001',
  workspaceId: 'ws-mock-001',
  email: 'maya@acme.com',
  status: 'connected',
  lastSyncedAt: new Date(Date.now() - 3600_000).toISOString(),
  filesIndexed: 142,
};

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const MOCK_DOCUMENTS: Document[] = [
  {
    id: 'doc-mock-001',
    workspaceId: 'ws-mock-001',
    driveFileId: 'gdrive-001',
    title: 'Q2 2026 Brand Positioning Framework',
    mimeType: 'application/vnd.google-apps.document',
    lastSyncedAt: new Date(Date.now() - 7200_000).toISOString(),
    freshnessScore: 87,
  },
  {
    id: 'doc-mock-002',
    workspaceId: 'ws-mock-001',
    driveFileId: 'gdrive-002',
    title: 'Competitor Analysis — Salesforce vs BOBA',
    mimeType: 'application/vnd.google-apps.document',
    lastSyncedAt: new Date(Date.now() - 86400_000).toISOString(),
    freshnessScore: 62,
  },
  {
    id: 'doc-mock-003',
    workspaceId: 'ws-mock-001',
    driveFileId: 'gdrive-003',
    title: 'ICP Personas v3.1',
    mimeType: 'application/vnd.google-apps.presentation',
    lastSyncedAt: new Date(Date.now() - 172800_000).toISOString(),
    freshnessScore: 43,
  },
];

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

export const MOCK_INSIGHTS: Insight[] = [
  {
    id: 'ins-mock-001',
    workspaceId: 'ws-mock-001',
    type: 'brand',
    title: 'Brand voice is consistent across marketing materials',
    summary:
      'Analysis of 38 indexed documents shows 94% alignment with established brand guidelines.',
    confidence: 'high',
    sourceDocs: ['doc-mock-001'],
    recommendation: 'Continue current voice guidelines; review 6 outlier documents.',
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    id: 'ins-mock-002',
    workspaceId: 'ws-mock-001',
    type: 'competitor',
    title: 'Salesforce positioning gap in AI-native GTM tools',
    summary: 'Competitor materials lack AI-first narrative; strong differentiation opportunity.',
    confidence: 'medium',
    sourceDocs: ['doc-mock-002'],
    recommendation: 'Emphasize AI-native architecture in next 3 sales cycles.',
    createdAt: new Date(Date.now() - 7200_000).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

export const IS_MOCK_MODE =
  (import.meta.env['VITE_USE_MOCK_DATA'] as string | undefined) === 'true';
