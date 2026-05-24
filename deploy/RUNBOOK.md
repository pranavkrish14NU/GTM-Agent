# BOBA Production Deployment Runbook

**Last updated:** 2026-05-24  
**Pipeline:** `boba-pipeline` (Cloud Deploy, us-central1)  
**Strategy:** Staging → Production canary (10 % → 50 % → 100 %)

---

## Table of Contents

1. [Architecture overview](#1-architecture-overview)
2. [Pre-deployment checklist](#2-pre-deployment-checklist)
3. [Deployment steps](#3-deployment-steps)
4. [Monitoring during rollout](#4-monitoring-during-rollout)
5. [Manual approval procedure](#5-manual-approval-procedure)
6. [Rollback procedure](#6-rollback-procedure)
7. [Troubleshooting](#7-troubleshooting)
8. [Contact / escalation](#8-contact--escalation)

---

## 1. Architecture overview

```
GitHub Actions (cd.yml)
        │
        ▼  gcloud deploy releases create
Cloud Deploy release
        │
        ├──▶ boba-staging (automatic, no approval)
        │         Full rolling deployment to staging GKE cluster.
        │         Health gates: Kubernetes readiness probes.
        │
        └──▶ boba-production (MANUAL APPROVAL REQUIRED)
                  Canary strategy:
                    Phase canary-10:  10 % traffic → verify (10 min) → auto-pass or auto-rollback
                    Phase canary-50:  50 % traffic → verify (10 min) → auto-pass or auto-rollback
                    Phase stable:    100 % traffic (full rollout complete)
```

**Automated rollback:** The `boba-rollback-auto` Cloud Deploy Automation triggers
a rollback to the last stable release if either canary verify step exits non-zero.

---

## 2. Pre-deployment checklist

Confirm all items before approving the production promotion:

- [ ] Staging deployment is `SUCCEEDED` (check Cloud Deploy console or `gcloud deploy rollouts list`)
- [ ] Staging smoke tests pass (run `make smoke-test-staging` or inspect CI summary)
- [ ] No P0/P1 incidents open in the production environment
- [ ] Cloud Monitoring dashboards show normal baselines (error rate < 1 %, p95 < 2 s)
- [ ] On-call engineer is available for the next 60 minutes
- [ ] Rollback command is bookmarked / saved (see [§6](#6-rollback-procedure))
- [ ] Feature flags are configured correctly (if this release includes feature-flagged code)

---

## 3. Deployment steps

### Step 1 — Merge to main

All changes merge to `main` via PR. The CI workflow runs automatically.
The CD workflow triggers on CI success and creates the Cloud Deploy release.

### Step 2 — Monitor staging rollout

The CD job waits up to 10 minutes for staging to succeed.
Check the GitHub Actions summary for the staging rollout status, or:

```bash
gcloud deploy rollouts list \
  --delivery-pipeline=boba-pipeline \
  --release=<RELEASE_NAME> \
  --region=us-central1 \
  --project=boba-staging-000000 \
  --filter="targetId=boba-staging"
```

### Step 3 — Approve production promotion

After staging succeeds, the pipeline is paused. Proceed to [§5](#5-manual-approval-procedure).

### Step 4 — Monitor canary phases

After approval, production receives the canary rollout:

| Phase | Traffic | Duration | Verify |
|-------|---------|----------|--------|
| canary-10 | 10 % | ~10 min | `check-canary-health.sh` |
| canary-50 | 50 % | ~10 min | `check-canary-health.sh` |
| stable | 100 % | — | Full rollout complete |

Monitor via Cloud Deploy console or:

```bash
gcloud deploy rollouts list \
  --delivery-pipeline=boba-pipeline \
  --release=<RELEASE_NAME> \
  --region=us-central1 \
  --project=boba-prod-000000 \
  --filter="targetId=boba-production"
```

---

## 4. Monitoring during rollout

### Key Cloud Monitoring metrics

| Metric | Threshold | Alert policy |
|--------|-----------|--------------|
| HTTP 5xx error rate | < 1 % | `boba-api-error-rate` |
| Request latency p95 | < 2 000 ms | `boba-api-latency-p95` |
| CPU utilisation | < 80 % | `boba-api-cpu` |
| Memory utilisation | < 85 % | `boba-api-memory` |
| Pod restart count | 0 | `boba-api-crash-loop` |

### Useful dashboards

- **GCP Console → Cloud Deploy → boba-pipeline**  
  Live phase status, verify job logs, rollback button.

- **GCP Console → Cloud Monitoring → Dashboards → BOBA Production**  
  Request rate, error rate, latency distribution, pod health.

- **GCP Console → Kubernetes Engine → Workloads → boba-api**  
  Canary and stable pod counts, readiness, restarts.

### Quick metric snapshot (CLI)

```bash
# Error rate for the last 10 minutes
gcloud monitoring read \
  "metric.type=\"loadbalancing.googleapis.com/https/request_count\"" \
  --project=boba-prod-000000 \
  --freshness=10m

# Latency p95 for the last 10 minutes
gcloud monitoring read \
  "metric.type=\"loadbalancing.googleapis.com/https/total_latencies\"" \
  --project=boba-prod-000000 \
  --freshness=10m
```

---

## 5. Manual approval procedure

### Option A — GCP Console (recommended)

1. Open [Cloud Deploy → Delivery Pipelines → boba-pipeline](https://console.cloud.google.com/deploy/delivery-pipelines/us-central1/boba-pipeline)
2. Find the pending release and click **Review**.
3. Complete the [pre-deployment checklist](#2-pre-deployment-checklist).
4. Click **Approve** to begin the canary rollout.
5. Click **Reject** to cancel the release (no production changes made).

### Option B — gcloud CLI

```bash
# List pending approvals
gcloud deploy rollouts list \
  --delivery-pipeline=boba-pipeline \
  --region=us-central1 \
  --project=boba-prod-000000 \
  --filter="approvalState=NEEDS_APPROVAL"

# Approve
gcloud deploy rollouts approve <ROLLOUT_NAME> \
  --delivery-pipeline=boba-pipeline \
  --region=us-central1 \
  --project=boba-prod-000000

# Reject
gcloud deploy rollouts reject <ROLLOUT_NAME> \
  --delivery-pipeline=boba-pipeline \
  --region=us-central1 \
  --project=boba-prod-000000
```

---

## 6. Rollback procedure

### Automatic rollback

If either canary verify step (canary-10 or canary-50) detects:
- Error rate ≥ 1 %, **or**
- Latency p95 ≥ 2 000 ms

…the `boba-rollback-auto` Automation triggers a rollback to `stable` phase
(the previously deployed version) within ~2 minutes of verify failure.
No human action is required.

### Manual rollback — CLI (fastest)

```bash
# 1. Find the rollout name for the current production release
gcloud deploy rollouts list \
  --delivery-pipeline=boba-pipeline \
  --region=us-central1 \
  --project=boba-prod-000000 \
  --filter="targetId=boba-production AND state=IN_PROGRESS OR state=PENDING_APPROVAL"

# 2. Rollback the rollout (reverts to the last stable Deployment revision)
gcloud deploy rollouts rollback <ROLLOUT_NAME> \
  --delivery-pipeline=boba-pipeline \
  --region=us-central1 \
  --project=boba-prod-000000

# Expected output:
#   Rolling back rollout <ROLLOUT_NAME>...done.
```

### Manual rollback — GCP Console

1. Open [Cloud Deploy → boba-pipeline](https://console.cloud.google.com/deploy/delivery-pipelines/us-central1/boba-pipeline).
2. Click the active release for `boba-production`.
3. Click the **⋮** (More) menu on the rollout → **Rollback**.
4. Confirm the rollback target (previous stable release).

### Emergency Kubernetes rollback (break-glass)

If Cloud Deploy is unavailable:

```bash
# Roll back the Kubernetes Deployment directly
kubectl rollout undo deployment/boba-api -n boba \
  --context=gke_boba-prod-000000_us-central1_boba-production

# Verify rollback status
kubectl rollout status deployment/boba-api -n boba \
  --context=gke_boba-prod-000000_us-central1_boba-production
```

---

## 7. Troubleshooting

### Canary verify fails immediately

**Symptom:** Verify step exits non-zero before the 10-minute window.  
**Likely cause:** Script cannot authenticate to Cloud Monitoring (Workload Identity not configured on the verify pod).  
**Fix:** Check the verify pod logs:
```bash
kubectl logs -l skaffold.dev/run-id=<RUN_ID> -n boba -c verify-canary
```
Ensure the `boba-api` KSA is bound to a GCP SA with `roles/monitoring.viewer`.

### Staging rollout stuck in PENDING

**Symptom:** `gcloud deploy rollouts list` shows `PENDING` for > 5 minutes.  
**Likely cause:** GKE nodes not ready, image pull failure, or resource quota exceeded.  
**Fix:**
```bash
kubectl describe pods -n boba -l app.kubernetes.io/name=boba-api \
  --context=gke_boba-staging-000000_us-central1_boba-staging
```

### No metrics in Cloud Monitoring

**Symptom:** `check-canary-health.sh` skips both checks (no data).  
**Likely cause:** Load Balancer metrics take 2–3 minutes to populate after traffic starts.  
**Action:** This is expected for the very first release. Verify skips are treated as PASS.  
**Long-term fix:** Add a readiness check that confirms at least N requests before evaluating.

### Release creation fails with "INVALID_ARGUMENT"

**Likely cause:** The Cloud Deploy pipeline resource (`boba-pipeline`) has not been applied.  
**Fix:**
```bash
gcloud deploy apply \
  --file=deploy/clouddeploy.yaml \
  --region=us-central1 \
  --project=boba-prod-000000
```

---

## 8. Contact / escalation

| Role | Contact |
|------|---------|
| On-call engineer | ops@boba.example.com / #ops-alerts Slack |
| Platform team | platform@boba.example.com |
| GCP support | [GCP Console → Support](https://console.cloud.google.com/support) |

**Cloud Deploy pipeline console:**  
https://console.cloud.google.com/deploy/delivery-pipelines/us-central1/boba-pipeline?project=boba-prod-000000
