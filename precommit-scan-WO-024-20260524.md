# Pre-Commit Security Scan — GTM-Agent (WO-024)

**Date:** 2026-05-24  
**Branch:** wo/WO-024  
**Verdict:** ✅ SAFE TO COMMIT — 0 new findings from WO-024 changes

## Summary

| Severity | New | Existing |
|----------|-----|----------|
| 🔴 Critical | 0 | 8 |
| 🟠 High | 0 | 52 |
| 🟡 Medium | 0 | 0 |
| 🟢 Low | 0 | 1 |
| **Total** | **0** | **61** |

**Risk Score:** 84.3/100 (pre-existing infrastructure findings, not introduced by WO-024)

## Finding Sources (all pre-existing)

- **Grype (60 findings):** Go stdlib CVEs (go1.20.12, go1.23.12) + go-jose, logrus, otel, grpc — in infra layer, not WO-024 files
- **Semgrep (1 warning):** missing-integrity in security-report HTML — pre-existing
- **Checkov (43 failed):** Terraform GCP resource hardening (Cloud SQL, Artifact Registry) — pre-existing infrastructure config
- **Gitleaks:** 0 secrets found ✓
- **npm audit:** 0 critical/high ✓
- **Hadolint:** 0 findings ✓

## WO-024 Changed Files (no findings)
- frontend/src/config/navigation.ts
- frontend/src/config/navigation.test.ts
- frontend/src/context/UserContext.tsx
- frontend/src/context/UserContext.test.tsx
- frontend/src/components/Layout/Sidebar.tsx
- frontend/src/components/Layout/Sidebar.module.css
- frontend/src/components/Layout/Sidebar.test.tsx
- frontend/src/components/Layout/Layout.tsx
- frontend/src/components/Layout/Layout.test.tsx
- frontend/src/types/index.ts
