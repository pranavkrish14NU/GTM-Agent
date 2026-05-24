# Runbook: Service Scaling

**Services:** `boba-api` (API pods), `boba-worker` (async worker pods)
**Cluster:** GKE Autopilot — `boba-prod` (us-central1)
**Namespace:** `boba`

---

## Overview

BOBA runs on GKE Autopilot with Horizontal Pod Autoscaler (HPA) managing replicas
automatically. This runbook covers **manual scaling** for situations where the HPA
is insufficient — e.g., a planned traffic spike, a degraded node pool, or a security
incident requiring scale-down.

---

## Symptoms That Might Require This Runbook

| Symptom | Action |
|---------|--------|
| P95 latency > 3 s during high traffic | Scale up `boba-api` |
| LLM job queue depth > 100 messages | Scale up `boba-worker` |
| Memory pressure / OOMKills | Investigate first; scale up if confirmed need |
| Security incident — contain blast radius | Scale down to 0 |
| Canary rollout — limit traffic surface | Scale down stable, keep canary |

---

## Scaling Limits

| Deployment | Min Replicas | Max Replicas | Notes |
|------------|-------------|-------------|-------|
| `boba-api` | 2 | 20 | Must keep ≥ 2 for HA |
| `boba-worker` | 1 | 10 | Single replica acceptable (jobs are idempotent) |

> **Never scale `boba-api` below 2** in production — a single replica removes HA
> and a rolling restart will cause downtime.

---

## Pre-Requisites

```bash
# Authenticate
gcloud container clusters get-credentials boba-prod \
  --region=us-central1 \
  --project=$PROJECT

# Confirm current state
kubectl get pods,hpa -n boba
```

---

## Step 1: Check Current State Before Scaling

```bash
# Pod counts and status
kubectl get deployment boba-api boba-worker -n boba

# HPA current / desired / max
kubectl get hpa -n boba

# Node resource utilisation
kubectl top nodes
kubectl top pods -n boba --sort-by=cpu
```

---

## Step 2: Scale the API (`boba-api`)

### Scale Up (manual override)

```bash
# Temporarily override HPA by patching minReplicas
kubectl patch hpa boba-api -n boba \
  --patch '{"spec":{"minReplicas": 6}}'

# Or bypass HPA entirely for an emergency ceiling raise
kubectl scale deployment boba-api --replicas=8 -n boba

# Monitor rollout
kubectl rollout status deployment/boba-api -n boba
kubectl get pods -n boba -w
```

### Scale Down

```bash
kubectl patch hpa boba-api -n boba \
  --patch '{"spec":{"minReplicas": 2}}'

kubectl scale deployment boba-api --replicas=2 -n boba
kubectl rollout status deployment/boba-api -n boba
```

### Emergency Scale to Zero (incident only)

```bash
# ⚠️ This takes the API offline entirely — all traffic will get 503
kubectl scale deployment boba-api --replicas=0 -n boba
```

---

## Step 3: Scale the Worker (`boba-worker`)

```bash
# Scale up — increase parallelism for job backlog
kubectl scale deployment boba-worker --replicas=4 -n boba

# Scale down — after backlog clears
kubectl scale deployment boba-worker --replicas=1 -n boba

# Monitor job queue depth (Cloud Tasks)
gcloud tasks queues describe boba-drive-sync \
  --location=us-central1 \
  --project=$PROJECT \
  --format="value(stats.tasksCount)"
```

---

## Step 4: Revert HPA to Automatic Control

After the incident/spike subsides, restore HPA to auto-manage:

```bash
# Restore HPA minReplicas to baseline
kubectl patch hpa boba-api -n boba \
  --patch '{"spec":{"minReplicas": 2}}'

kubectl patch hpa boba-worker -n boba \
  --patch '{"spec":{"minReplicas": 1}}'

# Confirm HPA is taking over
kubectl describe hpa boba-api -n boba | grep -A5 "Conditions:"
```

---

## Verification Steps

```bash
# API health check
curl -sf https://api.boba.example.com/health | jq .

# Confirm correct replica count
kubectl get deployment -n boba

# Confirm HPA is not stuck in a backoff loop
kubectl get events -n boba --field-selector reason=SuccessfulRescale
```

---

## When to Scale — Decision Guide

```
Is p95 latency > 2 s  OR  error rate > 1% ?
  YES → Check CPU/memory on pods (kubectl top pods -n boba)
         CPU > 70% → Scale up API replicas by 2
         Memory > 80% → File investigation ticket; scale up cautiously
  NO  → Do not scale; investigate root cause first
```

```
Is task queue depth > 50 AND growing?
  YES → Scale worker up to min(current*2, 10)
  NO  → Wait; HPA will handle it within 90 s
```

---

## Escalation Criteria

Escalate to the **Infrastructure On-Call** (see [Incident Response](./incident-response.md)) if:

- `kubectl scale` commands return errors (RBAC, API server unavailable)
- Pods are stuck in `Pending` > 5 min (node pool capacity issue)
- HPA is oscillating (scaling up/down every < 3 min)
- GKE node pool reports `NotReady` nodes
