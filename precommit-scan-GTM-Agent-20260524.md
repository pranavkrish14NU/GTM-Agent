# Pre-Commit Security Scan — GTM-Agent
**Date:** 2026-05-24  
**Verdict:** ✅ SAFE TO COMMIT — 0 new findings from WO-026 changes

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 59 |
| Medium | 0 |
| Low | 0 |
| Total | 60 |
| New (WO-026 changes) | 0 |
| Existing (pre-committed) | 60 |

Risk Score: 81.8/100 — all pre-existing findings in Go backend infra layer.

## Findings by Category

### Grype — Dependency Vulnerabilities (60 findings, all pre-existing)
All in Go backend packages. WO-026 adds only frontend TypeScript/CSS files.

- Critical x1: google.golang.org/grpc
- High x54: stdlib (Go)
- High x2: go.opentelemetry.io/otel/sdk
- High x1: go.opentelemetry.io/otel
- High x1: github.com/sirupsen/logrus
- High x1: github.com/go-jose/go-jose/v4

### Semgrep — 1 WARNING (not counted)
WARNING in auto-generated security-report HTML — not a source file.

### Checkov — 43 failed IaC checks (pre-existing Terraform/GH Actions config)

### Gitleaks: 0 secrets found
### npm audit: 0 Critical/High
### Hadolint: 0 Dockerfile findings
