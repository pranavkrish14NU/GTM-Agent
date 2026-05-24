/**
 * Mock API response payloads used across all E2E tests.
 *
 * These match the exact shapes returned by the real BOBA backend
 * so that page.route() intercepts are transparent to the frontend code.
 *
 * The fake JWT payload mirrors src/modules/Auth/fixtures.ts but is
 * built here for Node.js (Buffer.from instead of btoa).
 */

// ---------------------------------------------------------------------------
// Fake JWT for E2E auth simulation
// ---------------------------------------------------------------------------

function buildFakeJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'e2e-user-id',
      email: 'e2e@boba.test',
      displayName: 'E2E Test User',
      role: 'admin',
      workspaceId: 'e2e-workspace',
      iat: now - 60,
      exp: now + 3600,
    }),
  ).toString('base64url');
  return `${header}.${payload}.e2e-fake-signature`;
}

export const MOCK_JWT = buildFakeJwt();

export const MOCK_USER = {
  id: 'e2e-user-id',
  email: 'e2e@boba.test',
  displayName: 'E2E Test User',
  role: 'admin',
  workspaceId: 'e2e-workspace',
};

// ---------------------------------------------------------------------------
// Auth API responses
// ---------------------------------------------------------------------------

export const MOCK_CALLBACK_RESPONSE = {
  access_token: MOCK_JWT,
  token_type: 'Bearer',
  expires_in: 3600,
  user: MOCK_USER,
};

export const MOCK_REFRESH_RESPONSE = {
  access_token: MOCK_JWT,
  expires_in: 3600,
};

// ---------------------------------------------------------------------------
// Dashboard API response
// ---------------------------------------------------------------------------

export const MOCK_DASHBOARD_RESPONSE = {
  workspace_score: 72,
  last_analyzed_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  dimensions: [
    {
      id: 'messaging',
      dimension: 'Messaging',
      icon: '💬',
      score: 80,
      trend: 'improving',
      metric: 'Clarity score: 80/100',
      meaning: 'Your messaging is clear and compelling.',
      evidence: ['Homepage copy scores 82%', 'Demo deck clarity is 78%'],
      recommendation: 'Refine value proposition for enterprise segment.',
      next_action: 'Update homepage headline',
      period: 'Q2 2026',
    },
    {
      id: 'positioning',
      dimension: 'Positioning',
      icon: '🎯',
      score: 65,
      trend: 'stable',
      metric: 'Differentiation score: 65/100',
      meaning: 'Your positioning is average.',
      evidence: ['3 competitors use similar messaging'],
      recommendation: 'Identify unique differentiators.',
      next_action: 'Run competitive audit',
      period: 'Q2 2026',
    },
  ],
  sources: ['homepage', 'pitch-deck', 'case-studies'],
};

// ---------------------------------------------------------------------------
// Drive API responses
// ---------------------------------------------------------------------------

export const MOCK_DRIVE_HEALTH = {
  total_files: 42,
  synced_files: 38,
  freshness_score: 85,
  error_count: 2,
};

export const MOCK_DRIVE_FILES = {
  files: [
    {
      id: 'file-001',
      name: 'Product Roadmap Q2 2026.pdf',
      mime_type: 'application/pdf',
      freshness: 'fresh',
      modified_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      size_bytes: 245760,
      drive_url: 'https://drive.google.com/file/d/file-001',
      content_hash: 'hash-001',
    },
    {
      id: 'file-002',
      name: 'Competitive Analysis.docx',
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      freshness: 'stale',
      modified_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
      size_bytes: 102400,
      drive_url: 'https://drive.google.com/file/d/file-002',
      content_hash: 'hash-002',
    },
    {
      id: 'file-003',
      name: 'Brand Guidelines v3.pdf',
      mime_type: 'application/pdf',
      freshness: 'fresh',
      modified_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      size_bytes: 512000,
      drive_url: 'https://drive.google.com/file/d/file-003',
      content_hash: 'hash-003',
    },
  ],
  total: 3,
  page: 1,
  per_page: 20,
};

// ---------------------------------------------------------------------------
// Ask BOBA API response
// ---------------------------------------------------------------------------

export const MOCK_ASK_RESPONSE = {
  answer:
    'Based on your Drive documents, BOBA is an AI-native GTM intelligence platform for B2B marketing and sales teams. It automates competitive analysis, content generation, and win/loss insights.',
  evidence_summary: 'Found 3 relevant documents with high confidence.',
  sources: [
    {
      id: 'src-001',
      file_id: 'file-001',
      file_name: 'Product Roadmap Q2 2026.pdf',
      section: 'Executive Summary',
      page: 1,
      relevance_score: 0.95,
      drive_url: 'https://drive.google.com/file/d/file-001',
    },
    {
      id: 'src-002',
      file_id: 'file-003',
      file_name: 'Brand Guidelines v3.pdf',
      section: 'Brand Mission',
      page: 2,
      relevance_score: 0.88,
      drive_url: 'https://drive.google.com/file/d/file-003',
    },
  ],
  next_actions: [
    'Explore the competitive landscape in the Competitors module',
    'Generate targeted messaging in Content Studio',
  ],
  confidence: 'high',
};

// ---------------------------------------------------------------------------
// Content Studio API responses
// ---------------------------------------------------------------------------

export const MOCK_CONTENT_RESPONSE = {
  id: 'content-e2e-001',
  title: 'Why BOBA Beats Legacy GTM Tools',
  body: "In today's fast-moving B2B market, GTM teams need AI-native intelligence to stay ahead. BOBA delivers real-time competitive insights, automated content generation, and win/loss analysis — all powered by your own Drive documents.\n\nUnlike legacy tools that require manual data entry, BOBA connects directly to your knowledge base and surfaces actionable intelligence in seconds.",
  brand_voice_score: 87,
  persona_fit_score: 82,
  sources: [
    { file_id: 'file-001', file_name: 'Product Roadmap Q2 2026.pdf', section: 'Value Proposition' },
    { file_id: 'file-003', file_name: 'Brand Guidelines v3.pdf', section: 'Voice and Tone' },
  ],
  content_type: 'blog_post',
  tone: 'professional',
  created_at: new Date().toISOString(),
};

export const MOCK_SAVE_TO_DRIVE_RESPONSE = {
  file_id: 'saved-file-001',
  file_name: 'Why BOBA Beats Legacy GTM Tools.gdoc',
  drive_url: 'https://drive.google.com/file/d/saved-file-001',
  saved_at: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Settings API response
// ---------------------------------------------------------------------------

export const MOCK_SETTINGS_RESPONSE = {
  drive_connections: [
    {
      id: 'conn-001',
      email: 'workspace@boba.test',
      status: 'connected',
      connected_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      last_synced_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      files_synced: 38,
    },
  ],
  folder_mappings: [
    { id: 'map-001', folder_id: 'folder-1', folder_name: 'Marketing Assets', module: 'brand', drive_url: '#' },
    { id: 'map-002', folder_id: 'folder-2', folder_name: 'Sales Decks', module: 'personas', drive_url: '#' },
  ],
  members: [
    { id: 'user-001', email: 'admin@boba.test', displayName: 'Admin User', role: 'admin', joined_at: new Date().toISOString() },
    { id: 'user-002', email: 'editor@boba.test', displayName: 'Editor User', role: 'editor', joined_at: new Date().toISOString() },
  ],
  audit_logs: [
    {
      id: 'log-001',
      action: 'drive_connected',
      description: 'Connected workspace@boba.test Google Drive',
      actor_email: 'admin@boba.test',
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: {},
    },
    {
      id: 'log-002',
      action: 'member_invited',
      description: 'Invited editor@boba.test as editor',
      actor_email: 'admin@boba.test',
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: {},
    },
    {
      id: 'log-003',
      action: 'sync_triggered',
      description: 'Manual sync triggered by admin@boba.test',
      actor_email: 'admin@boba.test',
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      metadata: {},
    },
  ],
  sync_config: {
    frequency: 'daily',
    last_sync_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    next_sync_at: new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString(),
    is_running: false,
  },
};
