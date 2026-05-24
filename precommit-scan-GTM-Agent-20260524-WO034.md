# Pre-Commit Security Scan — GTM-Agent

**Date:** 2026-05-24  
**Work Order:** WO-034 (GTM Command Center Dashboard Frontend)  
**Verdict:** ✅ SAFE TO COMMIT — 0 new Critical/High findings

## Summary

| Severity | New (WO-034) | Existing |
|----------|-------------|---------|
| 🔴 Critical | 0 | 0 |
| 🟠 High | 0 | 60 (Go stdlib CVEs) |
| 🟡 Medium | 0 | 2 |
| 🟢 Low | 0 | 43 (checkov IaC) |
| **Total** | **0** | **105** |

**Risk Score:** 33.1/100 (Moderate Risk — all pre-existing)

## Findings

### Medium — semgrep

| # | Severity | Rule | File | Remediation |
|---|----------|------|------|-------------|
| 1 | 🟡 Medium | unsafe-formatstring | `frontend/src/components/ErrorBoundary/ErrorBoundary.tsx` | Pre-existing — ErrorBoundary uses string formatting; review before prod |
| 2 | 🟡 Medium | missing-integrity | `security-report-GTM-Agent-20260524.html` | Pre-existing report file — not shipped to production |

### High — grype (pre-existing, not new)

60 CVEs in Go stdlib and dependencies (`go-jose`, `logrus`, `opentelemetry`, `grpc`, `stdlib`).  
These are unchanged from WO-033 scan — no new vulnerable packages introduced by WO-034.

## WO-034 New Files Scanned

- `frontend/src/modules/Dashboard/index.tsx`
- `frontend/src/modules/Dashboard/api.ts`
- `frontend/src/modules/Dashboard/types.ts`
- `frontend/src/modules/Dashboard/Dashboard.module.css`
- `frontend/src/modules/Dashboard/fixtures.ts`
- `frontend/src/modules/Dashboard/Dashboard.test.tsx`

**Result:** 0 secrets, 0 high/critical vulnerabilities, 0 SAST issues in new code.
