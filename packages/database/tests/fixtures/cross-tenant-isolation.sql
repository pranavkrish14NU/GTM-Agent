-- Cross-tenant isolation test script
--
-- Usage:
--   psql "$DATABASE_URL" -f tests/fixtures/cross-tenant-isolation.sql
--
-- Prerequisites: schema migration (1_initial_schema) and RLS migration
-- (2_rls_policies) must have been applied.
--
-- This script verifies that setting workspace A's context prevents access
-- to workspace B's data, and vice versa.

BEGIN;

-- ============================================================
-- Setup: create two isolated test workspaces
-- ============================================================

INSERT INTO workspaces (id, name, plan) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Test Workspace A', 'starter'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Test Workspace B', 'starter');

INSERT INTO users (id, workspace_id, email, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001', 'user-a@test.example.com', 'owner'),
  ('bbbbbbbb-0000-0000-0000-000000000012', 'bbbbbbbb-0000-0000-0000-000000000002', 'user-b@test.example.com', 'owner');

-- ============================================================
-- Test 1: Workspace A context — can only see Workspace A data
-- ============================================================

SET app.current_workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- Should return exactly 1 row (Workspace A)
DO $$
DECLARE
  ws_count int;
BEGIN
  SELECT COUNT(*) INTO ws_count FROM workspaces;
  ASSERT ws_count = 1,
    FORMAT('FAIL T1a: expected 1 workspace, got %s (workspace A context)', ws_count);
  RAISE NOTICE 'PASS T1a: workspace A context shows 1 workspace';
END $$;

-- Should return exactly 1 user (from Workspace A)
DO $$
DECLARE
  user_count int;
BEGIN
  SELECT COUNT(*) INTO user_count FROM users;
  ASSERT user_count = 1,
    FORMAT('FAIL T1b: expected 1 user, got %s (workspace A context)', user_count);
  RAISE NOTICE 'PASS T1b: workspace A context shows 1 user';
END $$;

-- Verify it is Workspace A's user
DO $$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email FROM users LIMIT 1;
  ASSERT user_email = 'user-a@test.example.com',
    FORMAT('FAIL T1c: expected user-a, got %s', user_email);
  RAISE NOTICE 'PASS T1c: workspace A context shows correct user email';
END $$;

-- ============================================================
-- Test 2: Workspace B context — cannot see Workspace A data
-- ============================================================

SET app.current_workspace_id = 'bbbbbbbb-0000-0000-0000-000000000002';

-- Should return exactly 1 workspace (Workspace B, not A)
DO $$
DECLARE
  ws_count int;
BEGIN
  SELECT COUNT(*) INTO ws_count FROM workspaces;
  ASSERT ws_count = 1,
    FORMAT('FAIL T2a: expected 1 workspace, got %s (workspace B context)', ws_count);
  RAISE NOTICE 'PASS T2a: workspace B context shows 1 workspace';
END $$;

-- Should return exactly 1 user (from Workspace B, not A)
DO $$
DECLARE
  user_count int;
BEGIN
  SELECT COUNT(*) INTO user_count FROM users;
  ASSERT user_count = 1,
    FORMAT('FAIL T2b: expected 1 user, got %s (workspace B context)', user_count);
  RAISE NOTICE 'PASS T2b: workspace B context shows 1 user';
END $$;

DO $$
DECLARE
  user_email text;
BEGIN
  SELECT email INTO user_email FROM users LIMIT 1;
  ASSERT user_email = 'user-b@test.example.com',
    FORMAT('FAIL T2c: expected user-b, got %s', user_email);
  RAISE NOTICE 'PASS T2c: workspace B context shows correct user email';
END $$;

-- ============================================================
-- Test 3: INSERT WITH CHECK — cannot insert into wrong workspace
-- ============================================================

-- Context is Workspace B; attempt to insert a user into Workspace A should fail.
SET app.current_workspace_id = 'bbbbbbbb-0000-0000-0000-000000000002';

DO $$
BEGIN
  BEGIN
    INSERT INTO users (id, workspace_id, email, role)
    VALUES (
      'cccccccc-0000-0000-0000-000000000099',
      'aaaaaaaa-0000-0000-0000-000000000001',  -- Workspace A id
      'attacker@test.example.com',
      'member'
    );
    -- If we get here, the RLS check did not fire
    RAISE EXCEPTION 'FAIL T3: cross-tenant INSERT was not blocked by RLS';
  EXCEPTION
    WHEN check_violation OR insufficient_privilege THEN
      RAISE NOTICE 'PASS T3: cross-tenant INSERT blocked by RLS policy';
  END;
END $$;

-- ============================================================
-- Test 4: Empty context — returns no rows (null uuid match)
-- ============================================================

SET app.current_workspace_id = '';

DO $$
DECLARE
  ws_count int;
  user_count int;
BEGIN
  SELECT COUNT(*) INTO ws_count FROM workspaces;
  SELECT COUNT(*) INTO user_count FROM users;
  ASSERT ws_count = 0,
    FORMAT('FAIL T4a: expected 0 workspaces with empty context, got %s', ws_count);
  ASSERT user_count = 0,
    FORMAT('FAIL T4b: expected 0 users with empty context, got %s', user_count);
  RAISE NOTICE 'PASS T4: empty workspace context returns zero rows (safe default)';
END $$;

-- ============================================================
-- Cleanup
-- ============================================================
ROLLBACK;

RAISE NOTICE '=== Cross-tenant isolation tests complete ===';
