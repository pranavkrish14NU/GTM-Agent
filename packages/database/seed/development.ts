/**
 * Development seed script
 *
 * Creates a test workspace with representative sample data so developers can
 * immediately start the API and see non-empty UI state.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." npm run seed:dev
 *
 * Safe to run multiple times — uses ON CONFLICT DO NOTHING so existing rows
 * are not overwritten.
 */

import pg from 'pg';

const { Client } = pg;

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required.');
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL });

async function seed(): Promise<void> {
  await client.connect();
  console.log('✓ Connected to database');

  try {
    await client.query('BEGIN');

    // --- Workspace ---
    const workspaceId = '00000000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO workspaces (id, name, plan)
       VALUES ($1, 'Acme Corp (Dev)', 'pro')
       ON CONFLICT (id) DO NOTHING`,
      [workspaceId],
    );
    console.log('✓ Workspace seeded');

    // --- Owner user ---
    const ownerId = '00000000-0000-0000-0000-000000000002';
    await client.query(
      `INSERT INTO users (id, workspace_id, email, role)
       VALUES ($1, $2, 'owner@acme-dev.example.com', 'owner')
       ON CONFLICT DO NOTHING`,
      [ownerId, workspaceId],
    );

    // --- Member user ---
    const memberId = '00000000-0000-0000-0000-000000000003';
    await client.query(
      `INSERT INTO users (id, workspace_id, email, role)
       VALUES ($1, $2, 'member@acme-dev.example.com', 'member')
       ON CONFLICT DO NOTHING`,
      [memberId, workspaceId],
    );
    console.log('✓ Users seeded (owner + member)');

    // --- Drive connection (placeholder encrypted tokens) ---
    const connectionId = '00000000-0000-0000-0000-000000000004';
    await client.query(
      `INSERT INTO drive_connections
         (id, workspace_id, user_id, access_token_enc, refresh_token_enc, scopes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [
        connectionId,
        workspaceId,
        ownerId,
        'enc:dev-access-token-placeholder',
        'enc:dev-refresh-token-placeholder',
        ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.readonly'],
      ],
    );
    console.log('✓ Drive connection seeded');

    // --- Sample documents ---
    const doc1Id = '00000000-0000-0000-0000-000000000005';
    const doc2Id = '00000000-0000-0000-0000-000000000006';

    await client.query(
      `INSERT INTO documents
         (id, workspace_id, drive_connection_id, drive_file_id, title, mime_type, content_hash)
       VALUES
         ($1, $2, $3, 'drive_file_abc123', 'Q3 Sales Playbook', 'application/vnd.google-apps.document', 'hash_abc'),
         ($4, $2, $3, 'drive_file_def456', 'Competitor Analysis 2025', 'application/vnd.google-apps.document', 'hash_def')
       ON CONFLICT DO NOTHING`,
      [doc1Id, workspaceId, connectionId, doc2Id],
    );
    console.log('✓ Documents seeded (2 sample docs)');

    // --- Sample chunks with placeholder embeddings ---
    // Real embeddings would be 1536 floats; we use zeros here.
    const zeroVector = `[${Array(1536).fill(0).join(',')}]`;

    await client.query(
      `INSERT INTO chunks
         (id, workspace_id, document_id, chunk_index, content_hash, embedding, metadata)
       VALUES
         ('00000000-0000-0000-0000-000000000007', $1, $2, 0, 'chunk_hash_1',
          $3::vector, '{"source": "dev-seed", "tokens": 120}'::jsonb),
         ('00000000-0000-0000-0000-000000000008', $1, $2, 1, 'chunk_hash_2',
          $3::vector, '{"source": "dev-seed", "tokens": 98}'::jsonb)
       ON CONFLICT DO NOTHING`,
      [workspaceId, doc1Id, zeroVector],
    );
    console.log('✓ Chunks seeded (2 sample chunks)');

    // --- Sample Ask BOBA query ---
    await client.query(
      `INSERT INTO queries
         (id, workspace_id, user_id, query_text, response_summary)
       VALUES
         ('00000000-0000-0000-0000-000000000009', $1, $2,
          'What are our top competitive differentiators?',
          'Based on your sales playbook, the top differentiators are: faster implementation, dedicated CSM, and SOC 2 certification.')
       ON CONFLICT DO NOTHING`,
      [workspaceId, memberId],
    );
    console.log('✓ Query seeded');

    // --- Sample insight ---
    await client.query(
      `INSERT INTO insights
         (id, workspace_id, type, payload)
       VALUES
         ('00000000-0000-0000-0000-000000000010', $1, 'competitor',
          '{"score": 72, "competitors": ["CompetitorA", "CompetitorB"], "summary": "Dev seed insight"}'::jsonb)
       ON CONFLICT DO NOTHING`,
      [workspaceId],
    );
    console.log('✓ Insight seeded');

    // --- Sample content draft ---
    await client.query(
      `INSERT INTO content_drafts
         (id, workspace_id, user_id, title, body, status)
       VALUES
         ('00000000-0000-0000-0000-000000000011', $1, $2,
          'Blog: Why Teams Choose BOBA',
          'In today''s competitive GTM landscape...',
          'draft')
       ON CONFLICT DO NOTHING`,
      [workspaceId, memberId],
    );
    console.log('✓ Content draft seeded');

    await client.query('COMMIT');
    console.log('\n✅ Development seed complete.');
    console.log(`   Workspace ID : ${workspaceId}`);
    console.log(`   Owner email  : owner@acme-dev.example.com`);
    console.log(`   Member email : member@acme-dev.example.com`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed — rolled back:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
