# Pre-Commit Security Scan — database
**Date:** 2026-05-24  
**Verdict:** ✅ PASS — 0 Critical, 0 High findings. Commit allowed.

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 5 |
| 🟢 Low | 0 |
| **Total** | **5** |

**Risk Score:** 42.7/100 (Moderate Risk)

## Findings

### 🟡 Medium (5 — all pre-existing, not from WO-013 changes)

| # | Tool | Title | File | Remediation |
|---|------|-------|------|-------------|
| 1 | npm audit | GHSA-67mh-4wv8-2f99: esbuild dev server CORS | node_modules/esbuild | Upgrade vitest → breaking change (not required for P0) |
| 2 | npm audit | esbuild ≤0.24.2 via vite | node_modules/vite | Upgrade vitest@4.x when ready |
| 3 | npm audit | @vitest/mocker via vitest | node_modules/vitest | Upgrade vitest@4.x when ready |
| 4 | npm audit | vitest via vite-node | node_modules/vite-node | Upgrade vitest@4.x when ready |
| 5 | npm audit | vite ≤6.4.1 | node_modules/vite | Upgrade vitest@4.x when ready |

All 5 findings are transitive dev-dependency vulnerabilities in esbuild/vite/vitest
affecting the test runner only (not production runtime). No production code is affected.

## CVE Remediation (WO-013)

- ✅ **GHSA-5j98-mcp5-4vw2** (HIGH — glob CLI command injection) **RESOLVED**  
  `node-pg-migrate` upgraded from `^7.9.1` → `^8.0.4` which uses `glob ~11.1.0` (patched).  
  Confirmed: `npm list node-pg-migrate glob` → `node-pg-migrate@8.0.4 → glob@11.1.0`
