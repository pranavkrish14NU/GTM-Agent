# Runbook: Drive Sync Troubleshooting

**Service:** `boba-worker` — Google Drive sync pipeline
**Queue:** Cloud Tasks `boba-drive-sync` (us-central1)
**Last reviewed:** 2026-05-24

---

## Overview

BOBA syncs documents from Google Drive workspaces on a schedule (configurable per
workspace, default 1 h). The sync pipeline:

1. `boba-worker` dequeues a `DriveSync` task
2. Fetches changed files from the Drive API using a stored page token
3. Downloads content, embeds with pgvector, upserts into `documents`
4. Updates `drive_connections.last_sync_at` and the page token

Failures surface as:
- `drive_connections.sync_status = 'error'`
- Worker pod logs with `ERROR` level
- Cloud Tasks tasks being retried / exhausted

---

## Symptoms

| Symptom | Likely Cause |
|---------|-------------|
| Workspace shows "Sync failed" in UI | OAuth token expired or revoked |
| Documents not updating despite changes in Drive | Page token stale / Drive API quota exceeded |
| Worker pod crashing repeatedly | Unhandled exception in sync handler — check logs |
| Cloud Tasks queue depth growing without shrinking | Worker not consuming — check pod status |
| `rate_limit_exceeded` errors in worker logs | Drive API quota hit (1,000 req/100 s per project) |

---

## Diagnosis Steps

### 1. Check Workspace Sync Status

```bash
# Via psql (use Cloud SQL Auth Proxy)
psql "host=127.0.0.1 port=5432 dbname=boba user=boba" <<'SQL'
SELECT
  w.id,
  w.name,
  dc.sync_status,
  dc.last_sync_at,
  dc.last_error,
  dc.token_expires_at
FROM workspaces w
JOIN drive_connections dc ON dc.workspace_id = w.id
WHERE dc.sync_status = 'error'
   OR dc.last_sync_at < NOW() - INTERVAL '2 hours'
ORDER BY dc.last_sync_at ASC;
SQL
```

### 2. Check Worker Pod Logs

```bash
# Last 100 error-level log lines
kubectl logs -n boba -l app=boba-worker --tail=200 \
  | grep -E 'ERROR|error|Exception|failed' \
  | tail -40

# If pod has restarted, check previous instance
kubectl logs -n boba -l app=boba-worker --previous --tail=100
```

### 3. Check Cloud Tasks Queue

```bash
export PROJECT="boba-prod-000000"

# Queue stats
gcloud tasks queues describe boba-drive-sync \
  --location=us-central1 \
  --project=$PROJECT

# List failed/retrying tasks
gcloud tasks list \
  --queue=boba-drive-sync \
  --location=us-central1 \
  --project=$PROJECT \
  --filter="state=DISPATCHED OR state=FAILED" \
  --limit=20
```

### 4. Check Drive API Quota

```bash
# Cloud Monitoring — Drive API request count and errors
gcloud monitoring metrics list \
  --filter='metric.type="serviceruntime.googleapis.com/api/request_count" AND resource.labels.service="drive.googleapis.com"' \
  --project=$PROJECT \
  --format="table(metric.labels.response_code, points[0].value.int64Value)" \
  2>/dev/null | head -20
```

---

## Common Failures and Fixes

### OAuth Token Expired or Revoked

**Symptoms:** `last_error` contains `401` or `invalid_grant`.

**Resolution:**
1. Ask the workspace admin to reconnect the Drive integration in the BOBA UI.
   - Settings → Drive Connection → Reconnect
2. Once reconnected, manually trigger a re-sync (Step below).
3. If the workspace admin is unavailable, note the `workspace_id` and escalate to the
   product team to contact the customer.

**Verification:**
```sql
SELECT sync_status, token_expires_at, last_sync_at
FROM drive_connections
WHERE workspace_id = '<id>';
```
Expected: `sync_status = 'idle'`, `token_expires_at > NOW()`.

---

### Stale Page Token

**Symptoms:** Sync completes but documents are not updated. `last_error` may contain
`pageToken is no longer valid`.

**Resolution:** Reset the page token — the next sync will do a full re-crawl.

```sql
-- ⚠️ This triggers a full re-index for the workspace on next sync
UPDATE drive_connections
SET page_token = NULL, sync_status = 'idle'
WHERE workspace_id = '<workspace_id>';
```

Then re-trigger the sync (see below).

---

### Drive API Quota Exceeded

**Symptoms:** Worker logs show `rateLimitExceeded`; queue is accumulating tasks.

**Resolution:**
1. Scale down the worker temporarily to stop new requests:
   ```bash
   kubectl scale deployment boba-worker --replicas=0 -n boba
   ```
2. Wait 15–30 min for the quota window to reset.
3. Scale worker back up:
   ```bash
   kubectl scale deployment boba-worker --replicas=1 -n boba
   ```
4. Consider requesting a quota increase in Google Cloud Console:
   APIs & Services → Google Drive API → Quotas

---

### Worker Pod Crash Loop

**Symptoms:** Pod restarts > 3 times; `CrashLoopBackOff` in `kubectl get pods`.

**Resolution:**
1. Check for out-of-memory:
   ```bash
   kubectl describe pod -n boba -l app=boba-worker | grep -A5 "Last State:"
   ```
   If `OOMKilled`: increase worker memory limit in Helm values-prod.yaml.

2. Check for a panic in logs (previous container):
   ```bash
   kubectl logs -n boba -l app=boba-worker --previous
   ```
   File a bug with the stack trace.

3. If the crash is caused by a single malformed document:
   - Identify the `document_id` from the error log.
   - Mark it as skipped in the DB:
     ```sql
     UPDATE documents SET sync_status = 'skipped', last_error = 'manual skip via runbook'
     WHERE id = '<document_id>';
     ```

---

## Re-Trigger a Sync Manually

After fixing the root cause, trigger a re-sync for a specific workspace:

```bash
# Via API (requires admin JWT)
curl -sf -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.boba.example.com/v1/admin/sync/trigger" \
  -d '{"workspace_id": "<workspace_id>"}'
```

Or directly via Cloud Tasks:

```bash
gcloud tasks create-http-task \
  --queue=boba-drive-sync \
  --location=us-central1 \
  --url="https://api.boba.example.com/internal/sync" \
  --method=POST \
  --body-content='{"workspace_id":"<id>"}' \
  --header="Content-Type:application/json" \
  --project=$PROJECT
```

---

## Verification Steps

```bash
# 1. Confirm worker is running
kubectl get pods -n boba -l app=boba-worker

# 2. Watch worker logs for successful sync
kubectl logs -n boba -l app=boba-worker -f | grep -E 'sync|documents|completed'

# 3. Confirm DB updated
psql "host=127.0.0.1 port=5432 dbname=boba user=boba" <<'SQL'
SELECT id, sync_status, last_sync_at, last_error
FROM drive_connections
WHERE workspace_id = '<id>';
SQL
```

Expected: `sync_status = 'idle'`, `last_sync_at` within the last 5 min, `last_error = NULL`.

---

## Escalation Criteria

Escalate to the **Platform On-Call** (see [Incident Response](./incident-response.md)) if:

- Multiple workspaces (> 3) are failing simultaneously
- Worker pods are crashing and you cannot identify the root cause from logs
- Drive API quota is consistently exhausted at normal traffic levels
- OAuth tokens cannot be refreshed (may indicate a Google API issue or quota/billing problem)
