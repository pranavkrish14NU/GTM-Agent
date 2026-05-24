# Security Scan Report — GTM-Agent
**Date:** 5/24/2026 | **Scan Type:** Full | **Severity Threshold:** High | **Tool:** Opsera DevOps Agent

---

## Executive Summary

| Category        | Critical | High | Medium | Low | Total |
|-----------------|----------|------|--------|-----|-------|
| Secrets         | 0        | 0    | 0      | 0   | 0     |
| Dependencies    | 8        | 52   | 51     | 3   | 114   |
| SAST            | 0        | 0    | 0      | 0   | 0     |
| IaC (Checkov)   | 0        | 0    | 44     | 0   | 44    |
| Container       | 0        | 0    | 0      | 0   | 0     |
| Pkg Leakage     | 0        | 0    | 0      | 0   | 0     |
| **TOTAL**       | **8**    | **52** | **95** | **3** | **158** |

> ⚠️ **0 NEW findings from WO-017 changes** — all findings are pre-existing in the repository. WO-017 introduced no runtime dependencies.

---

## Risk Score: 86.5/100 (Critical Risk)

**Score Breakdown:**
`Score = min(100, round(log₁₀((8×100) + (52×30) + (51×10) + (3×3) + 1) × 25))`
`= min(100, round(log₁₀(2879 + 1) × 25)) = min(100, round(86.48)) = 86.5`

| Range    | Level           |
|----------|-----------------|
| 0        | No Risk         |
| 1–25     | Low Risk        |
| 26–50    | Moderate Risk   |
| 51–75    | High Risk       |
| 76–100   | **Critical Risk** |

---

## Scan Coverage

| Scanner       | Status  | Findings |
|---------------|---------|----------|
| 🔑 Gitleaks   | ✅ Passed | 0 secrets |
| 📦 Grype      | ✅ Passed | 8C / 52H / 51M / 3L |
| 🔍 Semgrep    | ✅ Passed | 0 issues |
| 🏗️ Checkov    | ⚠️ Findings | 44 failed checks (IaC) |
| 🐳 Hadolint   | ✅ Passed | No Dockerfiles |
| 📦 NPM Audit  | ✅ Passed | 0C / 0H / 5M / 0L |
| 📊 SonarQube  | ⏭️ Skipped | Not configured |

---

## STRIDE Threat Analysis

| Category               | Count | Notes |
|------------------------|-------|-------|
| **S** Spoofing         | 5     | HTTP chunked LF smuggling (CVE-2025-22871), gRPC auth bypass (GHSA-p77j-4mvh-x3m3), mail parsing (CVE-2024-24784) |
| **T** Tampering        | 35    | RCE-adjacent stdlib CVEs, encoding/decoding flaws, gRPC path bypass |
| **R** Repudiation      | 6     | Checkov: missing CloudSQL audit logging, missing GCP audit policies |
| **I** Information Disc | 28    | IPv6 address classification bugs (CVE-2024-24790), TLS CA field leak (CVE-2025-68121), CSEK missing encryption |
| **D** Denial of Service | 15   | HTTP/2 headers (CVE-2023-45288), HTTP/1.1 response splitting (CVE-2024-24791) |
| **E** Elevation        | 23   | Arithmetic overflow (CVE-2026-27143), TLS session resumption bypass (CVE-2025-68121), overly permissive IAM |

---

## Findings — Dependencies (Critical)

### CVE-2025-22871 — stdlib@go1.20.12 | CRITICAL
- **Description:** `net/http` improperly accepts a bare LF as chunk-size line terminator, enabling HTTP request smuggling.
- **Fix:** Upgrade Go toolchain to ≥ 1.24.x.

### CVE-2026-27143 — stdlib@go1.20.12 & go1.23.12 | CRITICAL
- **Description:** Integer arithmetic overflow on loop induction variables; can cause out-of-bounds memory access.
- **Fix:** Upgrade Go toolchain to ≥ 1.24.x.

### CVE-2024-24790 — stdlib@go1.20.12 | CRITICAL
- **Description:** `net.IsPrivate`, `net.IsLoopback` incorrect for IPv4-mapped IPv6 addresses; security filters bypass.
- **Fix:** Upgrade Go toolchain to ≥ 1.21.11 / 1.22.4.

### CVE-2023-24531 — stdlib@go1.20.12 | CRITICAL
- **Description:** `go env` outputs shell script; unsanitised env variables could lead to command injection.
- **Fix:** Upgrade Go toolchain.

### GHSA-p77j-4mvh-x3m3 — google.golang.org/grpc@v1.74.2 | CRITICAL
- **Description:** Authorization bypass via missing leading slash in `:path` header in gRPC-Go.
- **Fix:** Upgrade grpc-go to ≥ 1.74.3 (patch pending) or validate paths in middleware.

### CVE-2025-68121 — stdlib@go1.20.12 & go1.23.12 | CRITICAL
- **Description:** TLS session resumption with changed `ClientCAs`/`RootCAs` doesn't invalidate sessions.
- **Fix:** Upgrade Go toolchain to ≥ 1.24.x.

---

## Findings — Dependencies (High — Sample)

| Package | Version | CVE/GHSA | Description |
|---------|---------|----------|-------------|
| stdlib | go1.20.12 | CVE-2023-45288 | HTTP/2 headers flood DoS |
| stdlib | go1.20.12 | CVE-2024-24784 | net/mail address parser issue |
| stdlib | go1.20.12 | CVE-2024-24791 | net/http response splitting |
| stdlib | go1.20.12 | CVE-2024-34156 | encoding/gob stack overflow |
| stdlib | go1.20.12 | CVE-2024-34158 | go/build/constraint OOM |
| go.opentelemetry.io/otel | v1.36.0 | GHSA-mh2q-q3fh-2475 | OTel metric SDK issue |
| github.com/sirupsen/logrus | v1.8.1 | GHSA-4f99-4q7p-p3gh 	| logrus data exposure |

---

## Findings — IaC (Checkov — Sample)

| Check ID | File | Description |
|----------|------|-------------|
| CKV_GCP_84 | infra/terraform/modules/artifact-registry/main.tf | Missing CSEK encryption |
| CKV_GCP_79 | infra/terraform/modules/cloud-sql/main.tf | Not using latest major SQL version |
| CKV_GCP_110 | infra/terraform/modules/cloud-sql/main.tf | pgAudit not enabled |
| CKV_K8S_21 | deploy/charts/api-service/templates/ | Default namespace used |
| CKV_K8S_43 | deploy/charts/api-service/templates/deployment.yaml | Image not pinned to digest |

---

## Remediation Roadmap

### Quick Wins (Fix Today)
1. **Upgrade Go toolchain** in all Go services from `1.20.12` to `1.24.x` — resolves ~60 CVEs
2. **Pin container image digests** in Helm charts (`CKV_K8S_43`)
3. **Add namespace** to Helm chart deployments (not `default`) (`CKV_K8S_21`)

### Fix This Sprint

| Priority | Finding | Action | Effort |
|----------|---------|--------|--------|
| P1 | Go stdlib Critical CVEs | Upgrade Go to 1.24.x in all service Dockerfiles | 2h |
| P1 | gRPC auth bypass GHSA-p77j-4mvh-x3m3 | Upgrade grpc-go or add path validation middleware | 4h |
| P2 | TLS session resumption CVE-2025-68121 | Upgrade Go toolchain | 1h |
| P2 | CKV_GCP_110 pgAudit | Enable pgAudit in Cloud SQL terraform | 1h |

### Plan Next Quarter

| Priority | Finding | Action | Effort | Prerequisites |
|----------|---------|--------|--------|---------------|
| P2 | CKV_GCP_84 CSEK encryption | Configure customer-supplied encryption keys for Artifact Registry | 1 sprint | Security team approval |
| P2 | Logrus v1.8.1 GHSA | Upgrade to logrus v1.9.x | 2h | Go upgrade first |
| P3 | All remaining Checkov IaC | Remediate 44 checks across terraform + helm | 2 sprints | Infra team review |

---

*Generated by Opsera DevOps Agent | GTM-Agent | 5/24/2026*
