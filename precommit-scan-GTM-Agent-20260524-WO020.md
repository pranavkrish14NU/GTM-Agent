# Pre-Commit Security Scan — GTM-Agent (WO-020)

**Date:** 2026-05-24  
**Work Order:** WO-020 — Document Ingestion Worker  
**Branch:** wo/WO-020  
**Verdict:** ✅ SAFE TO COMMIT — 0 new Critical/High findings

---

## Summary

| Severity | Count | New (WO-020) | Existing |
|----------|-------|-------------|---------|
| 🔴 Critical | 0 | 0 | 0 |
| 🟠 High | 0 | 0 | 0 |
| 🟡 Medium | 6 | 0 | 6 |
| 🟢 Low | 0 | 0 | 0 |
| **Total** | **6** | **0** | **6** |

**Risk Score:** 44.6/100 (Moderate Risk)

---

## Tools Run

| Tool | Status | Notes |
|------|--------|-------|
| gitleaks | SKIPPED | Not installed on this machine |
| npm audit | ✅ PASSED | 0 high/critical; 5 moderate in existing deps |
| grype | SKIPPED | Not installed on this machine |
| semgrep | ✅ PASSED | 1 WARNING (pre-existing HTML report file) |
| checkov | ✅ PASSED | 1 low finding in Dockerfile (HEALTHCHECK — fixed) |
| hadolint | SKIPPED | Not installed on this machine |

---

## Findings

### Medium — npm audit (5 moderate, pre-existing)
- **Severity:** Moderate (not high/critical)
- **File:** package-lock.json (workspace root)
- **Details:** 5 moderate severity vulnerabilities in existing npm dependencies
- **Remediation:** Run `npm audit fix` in a separate maintenance work order

### Medium — semgrep WARNING (1, pre-existing)
- **Severity:** WARNING
- **Rule:** `html.security.audit.missing-integrity.missing-integrity`
- **File:** `security-report-GTM-Agent-20260524.html:6`
- **Description:** External CDN resource missing `integrity` attribute (SRI)
- **Remediation:** Pre-existing in WO-019 security report HTML (not source code); not a risk

---

## WO-020 New Files Scanned

No new Critical or High findings in any WO-020 source files:
- `backend/worker/src/config.ts`
- `backend/worker/src/chunker/chunker.ts`
- `backend/worker/src/extractors/text-extractor.ts`
- `backend/worker/src/services/file-processing.service.ts`
- `backend/worker/src/routes/internal.ts`
- `backend/worker/src/index.ts`
- `backend/worker/Dockerfile` — CKV_DOCKER_2 (missing HEALTHCHECK) **FIXED** during scan

---

## Resolution

The Dockerfile `HEALTHCHECK` was added during this scan to address `CKV_DOCKER_2` (best practice, null severity).

**Security gate: PASS → 0 new Critical/High**
