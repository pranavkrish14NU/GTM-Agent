# Runbook: Incident Response

**Applies to:** All BOBA production incidents
**Owner:** Platform Engineering
**Last reviewed:** 2026-05-24

---

## Severity Classification

| Severity | Definition | Response Time | Examples |
|----------|-----------|---------------|---------|
| **P1 — Critical** | Full service outage or data loss | 15 min | API returning 5xx for all users, DB unreachable, data corruption |
| **P2 — High** | Major feature degraded; significant user impact | 30 min | Ask BOBA down, Drive sync failing for all workspaces, auth failures |
| **P3 — Medium** | Partial degradation; workaround exists | 2 h | Single workspace sync failing, elevated latency (<3 s p95) |
| **P4 — Low** | Minor issue; cosmetic or edge-case | Next business day | Dashboard shows stale data, UI glitch, log noise |

---

## Escalation Matrix

| Role | Contact | Escalate When |
|------|---------|---------------|
| On-Call Engineer | PagerDuty rotation `boba-platform` | First responder — all P1/P2 alerts |
| Database On-Call | PagerDuty rotation `boba-db` | Any DB connectivity, PITR, or data loss |
| Infrastructure Lead | Slack `#boba-infra` + direct message | Node pool issues, GKE unavailable, network |
| Security Lead | Slack `#boba-security` + direct message | Suspected breach, credential exposure |
| Engineering Manager | Direct message | P1 > 30 min unresolved, customer-visible > 1 h |
| VP Engineering | Direct message | P1 > 1 h, data breach confirmed, regulatory notification required |

---

## Incident Response Procedure

### 1. Detect and Declare

- Alert fires in PagerDuty **or** engineer observes an anomaly.
- Open the incident Slack channel: `#incident-YYYYMMDD-<short-desc>`
  (e.g., `#incident-20260524-api-outage`)
- Post the initial communication (use template below).
- Assign **Incident Commander (IC)** — first responder owns this until handed off.

### 2. Triage

```bash
# 1. Check API health
curl -sf https://api.boba.example.com/health

# 2. Check pod status
kubectl get pods -n boba

# 3. Check recent error rate in Cloud Monitoring
gcloud monitoring metrics list \
  --filter='metric.type="loadbalancing.googleapis.com/https/request_count" AND metric.labels.response_code_class="500"' \
  --project=$PROJECT \
  --format="table(metric.labels, points[0])"

# 4. Check recent logs for errors
gcloud logging read \
  'resource.type="k8s_container" AND severity>=ERROR AND resource.labels.namespace_name="boba"' \
  --project=$PROJECT \
  --freshness=15m \
  --limit=50 \
  --format="table(timestamp, jsonPayload.message)"
```

### 3. Contain

Depending on the cause:

| Cause | Containment Action |
|-------|-------------------|
| Bad deploy | Roll back via Cloud Deploy: `gcloud deploy rollouts describe --delivery-pipeline=boba-pipeline --release=<name>` then trigger rollback Automation or manual kubectl rollback |
| Runaway process / OOM | `kubectl delete pod <pod-name> -n boba` (pod will restart clean) |
| Credential leak | Rotate immediately via Secret Manager; notify Security Lead |
| DB connection exhaustion | Scale down workers; see [Common Errors](./common-errors.md#database-connection-exhaustion) |
| DDoS / traffic spike | Enable Cloud Armor emergency rule; scale up API |

### 4. Resolve

- Apply the fix (runbook, hotfix deploy, or config change).
- Confirm metrics return to normal (error rate < 1%, p95 < 2 s).
- Post "Resolved" message in the incident channel.

### 5. Post-Mortem

File within **24 hours** for P1, **48 hours** for P2. See [Post-Mortem Template](#post-mortem-template).

---

## Communication Templates

### Initial Notification (post in `#incidents` and `#boba-status`)

```
🚨 INCIDENT DECLARED — <Severity>
Service: BOBA Platform
Impact: <one sentence — what users cannot do>
Start time: <UTC timestamp>
IC: <name>
Channel: <#incident-channel>
Next update: <time, max 30 min from now>
```

### Status Update (every 30 min for P1, every 1 h for P2)

```
📊 INCIDENT UPDATE — <#incident-channel>
Time: <UTC>
Status: Investigating / Identified / Mitigating / Monitoring
Summary: <one paragraph — what you know, what you are doing>
ETA to resolution: <time or "unknown">
Next update: <time>
```

### Resolution Message

```
✅ INCIDENT RESOLVED — <#incident-channel>
Resolved at: <UTC timestamp>
Duration: <X hours Y minutes>
Root cause: <one sentence>
Fix applied: <one sentence>
Post-mortem: <link or "to follow within 24 h">
```

---

## Post-Mortem Template

> Copy to Confluence or Google Doc. Link from the incident Slack channel.

```markdown
# Post-Mortem: <short incident title>

**Date:** YYYY-MM-DD
**Severity:** P1 / P2
**Duration:** X h Y min
**Authors:** <names>
**Status:** Draft / In Review / Final

## Summary
One paragraph describing what happened and the customer impact.

## Timeline (all times UTC)
| Time | Event |
|------|-------|
| HH:MM | Alert fired |
| HH:MM | IC assigned |
| HH:MM | Root cause identified |
| HH:MM | Fix deployed |
| HH:MM | Incident resolved |

## Root Cause
<Technical explanation — what failed and why>

## Contributing Factors
- <factor 1>
- <factor 2>

## What Went Well
- <thing 1>

## What Went Wrong
- <thing 1>

## Action Items
| Action | Owner | Due |
|--------|-------|-----|
| <item> | <name> | YYYY-MM-DD |

## Lessons Learned
<paragraph>
```

---

## Escalation Criteria (Summary)

Escalate to the next level if:
- P1 not contained within **30 min** of declaration
- Data loss is confirmed or suspected
- A security credential was exposed
- Regulatory notification may be required (GDPR, SOC 2)
- The fix requires a change outside the on-call engineer's access scope
