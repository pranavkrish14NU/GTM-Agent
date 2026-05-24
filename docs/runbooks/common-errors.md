# Runbook: Common Errors

**Applies to:** BOBA API and Worker services
**Last reviewed:** 2026-05-24

This runbook covers the three most common production error scenarios:

1. [429 Rate Limits](#1-429-rate-limit-errors)
2. [LLM Provider Failures](#2-llm-provider-failures)
3. [Database Connection Exhaustion](#3-database-connection-exhaustion)

---

## 1. 429 Rate Limit Errors

### Description

BOBA enforces two rate limits per authenticated user:
- **Standard:** 100 requests/min on all `/v1/*` routes
- **LLM:** 10 requests/min on `/v1/ask`, `/v1/content`, `/v1/campaigns`, `/v1/market`

When a user exceeds the limit, the API returns:
```json
HTTP 429 Too Many Requests
{ "error": "Too many requests, please try again later." }
```

### Symptoms

- Users reporting intermittent 429 errors in the UI
- Cloud Monitoring shows spike in `429` response codes
- Automated integrations hitting rate limits

### Diagnosis Steps

```bash
# Check 429 rate in Cloud Monitoring (last 15 min)
gcloud monitoring metrics list \
  --filter='metric.type="loadbalancing.googleapis.com/https/request_count" AND metric.labels.response_code_class="400"' \
  --project=$PROJECT \
  --format="table(metric.labels, points[0].value.int64Value)"

# Check which IPs / users are hitting limits
gcloud logging read \
  'resource.type="k8s_container" AND jsonPayload.message=~"429" AND resource.labels.namespace_name="boba"' \
  --project=$PROJECT \
  --freshness=15m \
  --limit=50 \
  --format="table(timestamp, jsonPayload.userId, jsonPayload.path)"
```

### Resolution Steps

**For a legitimate high-traffic user or integration:**

1. Identify the workspace/user from logs.
2. Options (in order of preference):
   - **Ask the user to batch requests** — stagger calls to stay under limits.
   - **Increase the limit for a specific user** — add them to the `rate_limit_exemptions`
     table (future feature; currently requires a code change to the middleware).
   - **Add a dedicated rate-limit tier** — create a Helm values patch for
     `RATE_LIMIT_STANDARD_RPM` and `RATE_LIMIT_LLM_RPM` env vars and redeploy.

**For a runaway integration or bot:**

1. Identify the JWT `sub` / workspace_id from logs.
2. Temporarily block the user:
   ```sql
   -- Suspend the user to stop further requests
   UPDATE users SET status = 'suspended' WHERE id = '<user_id>';
   ```
3. Contact the workspace admin to fix the integration.

### Verification Steps

```bash
# Confirm 429 rate drops in Cloud Monitoring after fix
# Check at T+5 min and T+15 min
```

### Escalation Criteria

Escalate to the Engineering Manager if:
- 429s affect > 10% of all requests (suggests misconfigured rate limit values)
- A legitimate customer's core workflow is blocked and an immediate fix is not safe to deploy

---

## 2. LLM Provider Failures

### Description

BOBA uses an LLM Gateway service (`@boba/llm-gateway`) that routes AI requests to
configured providers (e.g., OpenAI, Anthropic). If a provider is unavailable or
returns errors, Ask BOBA, content generation, and campaign planner will fail.

API response when LLM is unavailable:
```json
HTTP 500 Internal Server Error
{ "error": "LLM provider error. Please try again later." }
```
Or HTTP 503 if the request is rejected before reaching the provider.

### Symptoms

- `/v1/ask` returning 500 for all users
- `/v1/content` or `/v1/campaigns` failing consistently
- Worker logs showing `LLMProviderError` or `TokenBudgetExceeded`
- High LLM-route error rate in Cloud Monitoring

### Diagnosis Steps

```bash
# 1. Check for LLM errors in API logs
gcloud logging read \
  'resource.type="k8s_container" AND jsonPayload.message=~"LLM" AND severity>=ERROR AND resource.labels.namespace_name="boba"' \
  --project=$PROJECT \
  --freshness=15m \
  --limit=30 \
  --format="table(timestamp, jsonPayload.message, jsonPayload.provider)"

# 2. Check token budget
psql "host=127.0.0.1 port=5432 dbname=boba user=boba" <<'SQL'
SELECT provider, tokens_used_today, daily_budget, (tokens_used_today::float / daily_budget) AS pct
FROM llm_token_budgets
ORDER BY pct DESC;
SQL

# 3. Check provider status pages manually:
#    OpenAI: https://status.openai.com
#    Anthropic: https://status.anthropic.com
#    Google Vertex: https://status.cloud.google.com
```

### Resolution Steps

**Provider outage (external):**

1. Check provider status page (see links above).
2. If the primary provider is down:
   - Switch to the fallback provider by updating the `LLM_PRIMARY_PROVIDER` secret:
     ```bash
     gcloud secrets versions add boba-llm-config \
       --data-file=<(echo -n '{"primary":"anthropic","fallback":"openai"}') \
       --project=$PROJECT
     ```
   - Restart the API pods to pick up the new secret:
     ```bash
     kubectl rollout restart deployment/boba-api -n boba
     ```
3. Notify users via status page update.

**Token budget exhausted:**

1. Identify which workspace consumed the budget:
   ```sql
   SELECT workspace_id, SUM(tokens) AS total
   FROM llm_usage_log
   WHERE created_at > NOW() - INTERVAL '24 hours'
   GROUP BY workspace_id
   ORDER BY total DESC
   LIMIT 10;
   ```
2. Reset the budget (emergency only — log this action):
   ```sql
   UPDATE llm_token_budgets
   SET tokens_used_today = 0
   WHERE provider = 'openai';
   ```
3. Increase the daily budget in the Helm values if legitimate usage demands it.

**Provider returning 429 (upstream rate limit):**

1. Reduce concurrency in the LLM gateway:
   ```bash
   kubectl set env deployment/boba-api LLM_MAX_CONCURRENT_REQUESTS=2 -n boba
   ```
2. Scale down workers to reduce LLM call volume:
   ```bash
   kubectl scale deployment boba-worker --replicas=0 -n boba
   ```
3. Wait 5 min, then restore.

### Verification Steps

```bash
# Test ask endpoint with a simple query
curl -sf -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.boba.example.com/v1/ask" \
  -d '{"query": "What is our brand voice?", "workspace_id": "<id>"}' \
  | jq '.answer // .error'
```

Expected: A non-error `answer` string.

### Escalation Criteria

Escalate to the Engineering Manager / VP Engineering if:
- All configured LLM providers are simultaneously unavailable
- Token budget is exhausted due to a suspected abuse pattern (investigate as security incident)
- Provider is returning 500s for > 30 min with no resolution on their status page

---

## 3. Database Connection Exhaustion

### Description

BOBA uses a `pg.Pool` with a configurable maximum pool size (default: 10 connections
per API pod). Cloud SQL for PostgreSQL limits connections based on the instance tier.

When all connections are exhausted, new API requests immediately fail:
```json
HTTP 500 Internal Server Error
{ "error": "Internal server error" }
```
Worker logs show: `remaining connection slots are reserved`, `too many clients`.

### Symptoms

- Sudden spike in 500 errors across all API endpoints
- Worker pods logging `pg connection error` or `connection pool exhausted`
- Cloud SQL metrics showing `database/postgresql/num_backends` at or near the max
- API response times spike, then requests fail fast with 500

### Diagnosis Steps

```bash
# 1. Check active connections in Cloud SQL
gcloud monitoring metrics list \
  --filter='metric.type="cloudsql.googleapis.com/database/postgresql/num_backends"' \
  --project=$PROJECT \
  --format="table(metric.labels, points[0].value.int64Value)"

# 2. Check from within the DB
psql "host=127.0.0.1 port=5432 dbname=boba user=boba" <<'SQL'
-- Connection count by application
SELECT application_name, state, COUNT(*) AS count
FROM pg_stat_activity
GROUP BY application_name, state
ORDER BY count DESC;

-- Longest-running idle connections (connection leak candidates)
SELECT pid, application_name, state, query_start,
       NOW() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND query_start < NOW() - INTERVAL '5 minutes'
ORDER BY duration DESC;
SQL

# 3. Check API pod count (more pods = more connections)
kubectl get deployment boba-api -n boba -o jsonpath='{.spec.replicas}'
```

### Resolution Steps

**Immediate mitigation — terminate idle connections:**

```sql
-- ⚠️ Only terminate idle connections, never active queries
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state IN ('idle', 'idle in transaction')
  AND query_start < NOW() - INTERVAL '10 minutes'
  AND pid <> pg_backend_pid();
```

**Reduce pool demand — scale down API if over-scaled:**

```bash
kubectl scale deployment boba-api --replicas=3 -n boba
```

**If exhaustion is caused by a connection leak:**

1. Identify the leaking pod:
   ```bash
   kubectl top pods -n boba
   # Or check pg_stat_activity.application_name for unusual pod IDs
   ```
2. Delete the leaking pod (it will restart clean):
   ```bash
   kubectl delete pod <leaking-pod-name> -n boba
   ```

**Increase Cloud SQL connection limit (longer-term fix):**

1. Check current max:
   ```bash
   gcloud sql instances describe $INSTANCE \
     --project=$PROJECT \
     --format="value(settings.databaseFlags)"
   ```
2. Increase `max_connections` via Cloud SQL flags (requires instance restart):
   ```bash
   gcloud sql instances patch $INSTANCE \
     --database-flags="max_connections=200" \
     --project=$PROJECT
   ```
   > A Cloud SQL instance restart causes ~30–60 s of downtime. Schedule during maintenance window or ensure GKE pods reconnect gracefully.

3. Alternatively, enable **PgBouncer** (connection pooling proxy) — see the infrastructure
   runbook for setup instructions.

### Verification Steps

```bash
# 1. Confirm connection count dropped
psql ... <<'SQL'
SELECT COUNT(*) FROM pg_stat_activity WHERE datname = 'boba';
SQL

# 2. Confirm API health
curl -sf https://api.boba.example.com/health | jq .

# 3. Check error rate dropped in Cloud Monitoring (T+5 min)
```

### Escalation Criteria

Escalate to the **Database On-Call** (see [Incident Response](./incident-response.md)) if:

- Terminating idle connections does not resolve the issue
- `max_connections` increase requires a Cloud SQL instance restart during business hours
- A connection leak cannot be identified from pod logs
- Cloud SQL instance itself becomes unavailable during the remediation
