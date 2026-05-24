# Pre-Commit Security Scan — GTM-Agent
**Date:** 5/24/2026 | **Branch:** wo/WO-017 | **Verdict:** SAFE TO COMMIT

## Summary

| Severity | New (WO-017) | Existing | Total |
|----------|-------------|----------|-------|
| Critical | 0 | 8 | 8 |
| High | 0 | 52 | 52 |
| Medium | 0 | 100 | 100 |
| Low | 0 | 3 | 3 |
| **Total** | **0** | **163** | **163** |

Risk Score: 88.2/100 (Critical Risk) — all pre-existing, 0 new from WO-017

## Findings by Category

### Secrets (Gitleaks) - CLEAN
### SAST (Semgrep) - CLEAN
### Container (Hadolint) - No Dockerfiles

### Dependencies (Grype) — 8C / 52H — all pre-existing
- stdlib@go1.20.12 CVE-2025-22871 Critical — HTTP request smuggling
- stdlib@go1.20.12 CVE-2026-27143 Critical — Integer overflow
- stdlib@go1.20.12 CVE-2024-24790 Critical — IPv6 misclassification
- google.golang.org/grpc@v1.74.2 GHSA-p77j-4mvh-x3m3 Critical — gRPC auth bypass
- stdlib@go1.20.12 CVE-2023-45288 High — HTTP/2 DoS
- + 47 more High from Go stdlib

### IaC (Checkov) — 44 medium — all pre-existing infra files
