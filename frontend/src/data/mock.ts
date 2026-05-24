/// <reference types="vite/client" />
/**
 * Mock data for prototype/demo mode.
 *
 * ⚠️ MOCK DATA — clearly labeled. Never use in production pipelines.
 * Feature flag: VITE_USE_MOCK_DATA=true
 */

import type { User, Workspace, Document, Insight, DriveConnection } from '../types/index.js';

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

export const MOCK_DRIVE_CONNECTION: DriveConnection = {
  id: 'conn-mock-001',
  workspaceId: 'ws-mock-001',
  email: 'maya@acme.com',
  status: 'connected',
  lastSyncedAt: new Date(Date.now() - 3600_000).toISOString(),
  filesIndexed: 142,
};

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

export const IS_MOCK_MODE =
  (import.meta.env['VITE_USE_MOCK_DATA'] as string | undefined) === 'true';
