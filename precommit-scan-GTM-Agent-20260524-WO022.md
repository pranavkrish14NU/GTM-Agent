# Pre-Commit Security Scan — GTM-Agent WO-022
**Date:** 2026-05-24 | **Verdict:** ✅ SAFE TO COMMIT — 0 new findings

## Summary

| Severity | New (WO-022) | Existing |
|----------|-------------|---------|
| 🔴 Critical | 0 | 8 |
| 🟠 High | 0 | 52 |
| 🟡 Medium | 0 | 5 |
| 🟢 Low | 0 | 3 |
| **Total** | **0** | **68** |

**Risk Score:** 84.6/100 (pre-existing only — no new risk introduced)

## New Findings (WO-022 Changes)
None — all 0 new Critical/High.

## Pre-existing Findings (not introduced by WO-022)

### Grype — Go Module CVEs (all in infra Go dependencies)
- 🔴 CRITICAL: CVE-2023-24531 in stdlib@go1.20.12
- 🔴 CRITICAL: CVE-2025-22871 in stdlib@go1.20.12
- 🟠 HIGH (×52): Various CVEs in stdlib@go1.20.12 (Go standard library)
- **Remediation:** Update Go toolchain in infra/deploy modules to go1.23+

### npm audit — Medium
- 🟡 MEDIUM (×5): vite/vitest/esbuild dev-dependency vulnerabilities
- **Remediation:** `npm audit fix` in dev environment (no production impact)

### Semgrep — Warning
- ⚠️ WARNING: `html.security.audit.missing-integrity` in `security-report-GTM-Agent-20260524.html` (generated report file, not source code)

### Checkov — IaC
- 43 failed checks, all UNKNOWN severity (Terraform/Dockerfile best-practice warnings)

## WO-022 Files Scanned (Clean)
- `backend/worker/src/services/embedding.service.ts` — NEW
- `backend/worker/tests/embedding.service.test.ts` — NEW
- `backend/worker/src/routes/internal.ts` — MODIFIED
- `backend/worker/src/index.ts` — MODIFIED
- `backend/worker/package.json` — MODIFIED
- `packages/llm-gateway/src/providers/anthropic.provider.ts` — MODIFIED (type fix)
