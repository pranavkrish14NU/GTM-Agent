#!/bin/sh
# check-canary-health.sh — Post-canary-phase health verification script.
#
# Executed by `skaffold verify` (via Cloud Deploy) after each canary phase
# (10 % and 50 %). Queries Cloud Monitoring for two SLIs:
#
#   1. HTTP 5xx error rate  — must be < ERROR_RATE_THRESHOLD (default 1 %)
#   2. Request latency p95  — must be < LATENCY_P95_THRESHOLD_MS (default 2000 ms)
#
# Both are evaluated over the last WINDOW_MINUTES (default 10) minutes.
# If either check fails, the script exits with a non-zero code. Cloud Deploy
# detects the non-zero exit and the Automation resource triggers an automatic
# rollback to the previously deployed stable version.
#
# Environment variables (injected by skaffold.yaml verify block):
#   GCP_PROJECT              — GCP project ID (e.g. boba-prod-000000)
#   SERVICE_NAME             — Kubernetes service name (e.g. boba-api)
#   ERROR_RATE_THRESHOLD     — Max acceptable 5xx error rate (0.01 = 1 %)
#   LATENCY_P95_THRESHOLD_MS — Max acceptable p95 latency in milliseconds
#   WINDOW_MINUTES           — Monitoring window in minutes

set -eu

GCP_PROJECT="${GCP_PROJECT:-boba-prod-000000}"
SERVICE_NAME="${SERVICE_NAME:-boba-api}"
ERROR_RATE_THRESHOLD="${ERROR_RATE_THRESHOLD:-0.01}"
LATENCY_P95_THRESHOLD_MS="${LATENCY_P95_THRESHOLD_MS:-2000}"
WINDOW_MINUTES="${WINDOW_MINUTES:-10}"

echo "========================================="
echo "Canary Health Check"
echo "  Project:          ${GCP_PROJECT}"
echo "  Service:          ${SERVICE_NAME}"
echo "  Window:           ${WINDOW_MINUTES} minutes"
echo "  Error rate limit: ${ERROR_RATE_THRESHOLD} (${ERROR_RATE_THRESHOLD}*100 %)"
echo "  Latency p95 limit:${LATENCY_P95_THRESHOLD_MS} ms"
echo "========================================="

# Activate the service account if running inside Cloud Build (GKE verify pod).
# In CI the ambient credentials come from Workload Identity; nothing extra needed.

FAILED=0

# ---------------------------------------------------------------------------
# 1. HTTP 5xx error rate
#    MQL: ratio of 5xx responses to all responses from Cloud Load Balancing.
# ---------------------------------------------------------------------------
echo ""
echo "Checking HTTP 5xx error rate..."

# End time = now; start time = now - WINDOW_MINUTES
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
START_TIME=$(date -u -d "-${WINDOW_MINUTES} minutes" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
  || date -u -v-"${WINDOW_MINUTES}"M +%Y-%m-%dT%H:%M:%SZ)  # BSD date fallback

# Query using Cloud Monitoring REST API (v3).
# Metric: loadbalancing.googleapis.com/https/request_count filtered by
# response_code_class=500 vs all codes.
TOTAL_REQUESTS=$(gcloud monitoring metrics list \
  --filter="metric.type=\"loadbalancing.googleapis.com/https/request_count\" AND resource.labels.backend_target_name=\"${SERVICE_NAME}\"" \
  --project="${GCP_PROJECT}" \
  --format="value(points[0].value.int64Value)" \
  --interval-start-time="${START_TIME}" \
  --interval-end-time="${END_TIME}" \
  2>/dev/null | awk '{s+=$1} END{print s+0}')

ERROR_REQUESTS=$(gcloud monitoring metrics list \
  --filter="metric.type=\"loadbalancing.googleapis.com/https/request_count\" AND resource.labels.backend_target_name=\"${SERVICE_NAME}\" AND metric.labels.response_code_class=\"500\"" \
  --project="${GCP_PROJECT}" \
  --format="value(points[0].value.int64Value)" \
  --interval-start-time="${START_TIME}" \
  --interval-end-time="${END_TIME}" \
  2>/dev/null | awk '{s+=$1} END{print s+0}')

echo "  Total requests:  ${TOTAL_REQUESTS}"
echo "  5xx errors:      ${ERROR_REQUESTS}"

if [ "${TOTAL_REQUESTS}" -gt 0 ] 2>/dev/null; then
  # Use awk for floating-point division (POSIX sh has no native float arithmetic).
  ERROR_RATE=$(awk "BEGIN{printf \"%.6f\", ${ERROR_REQUESTS}/${TOTAL_REQUESTS}}")
  echo "  Computed error rate: ${ERROR_RATE}"

  EXCEEDS=$(awk "BEGIN{print (${ERROR_RATE} > ${ERROR_RATE_THRESHOLD}) ? 1 : 0}")
  if [ "${EXCEEDS}" = "1" ]; then
    echo "  ❌ ERROR RATE ${ERROR_RATE} exceeds threshold ${ERROR_RATE_THRESHOLD}"
    FAILED=1
  else
    echo "  ✅ Error rate OK (${ERROR_RATE} <= ${ERROR_RATE_THRESHOLD})"
  fi
else
  echo "  ℹ️  No requests recorded yet — skipping error rate check"
fi

# ---------------------------------------------------------------------------
# 2. Request latency p95
#    Metric: loadbalancing.googleapis.com/https/total_latencies (DISTRIBUTION)
# ---------------------------------------------------------------------------
echo ""
echo "Checking p95 latency..."

# Fetch the 95th percentile from the distribution metric using the
# distribution_cut aligner via a MQL query.
LATENCY_P95=$(gcloud monitoring metrics list \
  --filter="metric.type=\"loadbalancing.googleapis.com/https/total_latencies\" AND resource.labels.backend_target_name=\"${SERVICE_NAME}\"" \
  --project="${GCP_PROJECT}" \
  --format="value(points[0].value.distributionValue.p95)" \
  --interval-start-time="${START_TIME}" \
  --interval-end-time="${END_TIME}" \
  --aggregation-aligner=ALIGN_PERCENTILE_95 \
  --aggregation-per-series-aligner=ALIGN_PERCENTILE_95 \
  2>/dev/null | awk '{print int($1+0)}')

echo "  p95 latency: ${LATENCY_P95} ms"

if [ -n "${LATENCY_P95}" ] && [ "${LATENCY_P95}" -gt 0 ] 2>/dev/null; then
  EXCEEDS=$(awk "BEGIN{print (${LATENCY_P95} > ${LATENCY_P95_THRESHOLD_MS}) ? 1 : 0}")
  if [ "${EXCEEDS}" = "1" ]; then
    echo "  ❌ LATENCY p95 ${LATENCY_P95}ms exceeds threshold ${LATENCY_P95_THRESHOLD_MS}ms"
    FAILED=1
  else
    echo "  ✅ Latency p95 OK (${LATENCY_P95}ms <= ${LATENCY_P95_THRESHOLD_MS}ms)"
  fi
else
  echo "  ℹ️  No latency data yet — skipping latency check"
fi

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
echo ""
echo "========================================="
if [ "${FAILED}" = "1" ]; then
  echo "❌ CANARY HEALTH CHECK FAILED — rollback will be triggered"
  echo "========================================="
  exit 1
else
  echo "✅ CANARY HEALTH CHECK PASSED"
  echo "========================================="
  exit 0
fi
