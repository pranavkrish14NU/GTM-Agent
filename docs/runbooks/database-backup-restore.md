# Runbook: Database Backup and Restore (Cloud SQL PITR)

**Service:** `boba-db` (Cloud SQL for PostgreSQL 15)
**Severity impact:** P1 — data loss risk
**Last reviewed:** 2026-05-24

---

## Overview

BOBA uses **Cloud SQL for PostgreSQL** with automatic backups and Point-in-Time Recovery
(PITR) enabled. This runbook covers:

1. Verifying backup health
2. Restoring to a specific point in time
3. Restoring from a named backup
4. Verifying restore success

---

## Symptoms That Might Require This Runbook

| Symptom | Likely Cause |
|---------|-------------|
| Data missing or corrupted after a deploy | Bad migration, accidental DELETE |
| API returns unexpected 500s with DB constraint errors | Schema drift / failed migration |
| Explicit data loss reported by users | Accidental cascade delete |
| Cloud SQL instance unavailable | Instance failure — needs restore to replica |

---

## Pre-Requisites

- GCP project access with `roles/cloudsql.admin`
- `gcloud` CLI authenticated: `gcloud auth login`
- Cloud SQL instance name: `boba-db` (confirm: `gcloud sql instances list --project=$PROJECT`)
- Target database name: `boba`

```bash
export PROJECT="boba-prod-000000"       # replace with actual project ID
export INSTANCE="boba-db"
export DB="boba"
export RESTORE_TIME="2026-05-24T10:00:00Z"   # ISO 8601, UTC
```

---

## Step 1: Verify Backup Health

```bash
# List available automated backups (most recent first)
gcloud sql backups list \
  --instance=$INSTANCE \
  --project=$PROJECT \
  --sort-by="~windowStartTime" \
  --limit=10

# Confirm PITR window
gcloud sql instances describe $INSTANCE \
  --project=$PROJECT \
  --format="value(settings.backupConfiguration.pointInTimeRecoveryEnabled,settings.backupConfiguration.transactionLogRetentionDays)"
```

Expected output: `pointInTimeRecoveryEnabled=True`, `transactionLogRetentionDays=7`

---

## Step 2: Identify the Recovery Point

For **accidental data loss**, find the last known-good timestamp from:

1. Application logs (Cloud Logging):
   ```bash
   gcloud logging read \
     'resource.type="k8s_container" AND jsonPayload.message=~"DELETE" AND resource.labels.namespace_name="boba"' \
     --project=$PROJECT \
     --freshness=1h \
     --format="table(timestamp, jsonPayload.message)"
   ```
2. Audit logs:
   ```bash
   gcloud logging read \
     'logName:"cloudaudit.googleapis.com/data_access" AND protoPayload.methodName="cloudsql.instances.query"' \
     --project=$PROJECT \
     --freshness=2h
   ```

Choose a `RESTORE_TIME` **before** the incident.

---

## Step 3a: PITR Restore (Preferred)

> ⚠️ PITR restores to a **new instance**. The existing instance continues running until you
> complete the cutover.

```bash
export RESTORE_INSTANCE="${INSTANCE}-restored-$(date +%Y%m%d%H%M)"

# Clone the instance to a point in time
gcloud sql instances clone $INSTANCE $RESTORE_INSTANCE \
  --point-in-time=$RESTORE_TIME \
  --project=$PROJECT

# Verify clone is RUNNABLE
gcloud sql instances describe $RESTORE_INSTANCE \
  --project=$PROJECT \
  --format="value(state)"
```

Expected: `RUNNABLE` (may take 5–15 min for large instances).

---

## Step 3b: Named-Backup Restore (Alternative)

If PITR is not granular enough:

```bash
# Get backup ID from Step 1 listing
export BACKUP_ID="<backup-run-id>"

# Restore overwrites the instance IN PLACE — ensure maintenance window or
# accept brief downtime (API returns 503 during restore)
gcloud sql backups restore $BACKUP_ID \
  --restore-instance=$INSTANCE \
  --project=$PROJECT
```

---

## Step 4: Validate the Restored Data

Connect via Cloud SQL Auth Proxy:

```bash
# Terminal 1 — start proxy
cloud-sql-proxy --address=127.0.0.1 --port=5432 \
  "${PROJECT}:us-central1:${RESTORE_INSTANCE}"

# Terminal 2 — connect and spot-check
psql "host=127.0.0.1 port=5432 dbname=$DB user=boba" <<'SQL'
-- Row counts sanity check
SELECT relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC
LIMIT 10;

-- Most recent workspace activity
SELECT id, name, created_at FROM workspaces ORDER BY created_at DESC LIMIT 5;

-- Check documents
SELECT COUNT(*) FROM documents;
SQL
```

---

## Step 5: Cutover (PITR Path)

After validating the restored instance:

```bash
# 1. Scale API replicas to 0 to prevent writes during cutover
kubectl scale deployment boba-api --replicas=0 -n boba

# 2. Rename instances
gcloud sql instances patch $INSTANCE \
  --database-flags "" \
  --project=$PROJECT  # no-op ping to confirm connectivity

# Update the DB_URL secret to point to the restored instance connection string
gcloud secrets versions add boba-db-url \
  --data-file=<(echo -n "postgresql://boba:<pass>@/${DB}?host=/cloudsql/${PROJECT}:us-central1:${RESTORE_INSTANCE}") \
  --project=$PROJECT

# 3. Restart API
kubectl scale deployment boba-api --replicas=2 -n boba
kubectl rollout status deployment/boba-api -n boba
```

---

## Verification Steps

```bash
# Confirm API health
curl -sf https://api.boba.example.com/health | jq .

# Confirm a representative query returns data
curl -sf -H "Authorization: Bearer $TOKEN" \
  "https://api.boba.example.com/v1/documents?limit=5" | jq '.total'
```

---

## Escalation Criteria

Escalate to the **Database On-Call** (see [Incident Response](./incident-response.md)) if:

- `gcloud sql instances clone` fails with an error after 20 min
- Restored row counts are lower than expected by >5%
- PITR window does not cover the required recovery time
- Cloud SQL instance cannot be reached after restore

---

## Post-Restore Tasks

1. Delete the temporary restored instance once you are confident in production:
   ```bash
   gcloud sql instances delete $RESTORE_INSTANCE --project=$PROJECT
   ```
2. File a post-mortem within 24 h (see [Incident Response](./incident-response.md#post-mortem-template)).
3. Update this runbook if a step was wrong or missing.
