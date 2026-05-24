# Pre-Commit Security Scan — GTM-Agent (WO-027)
**Date:** 2026-05-24  
**Verdict:** SAFE TO COMMIT — 0 new findings from WO-027 changes

| Severity | Count | New | Existing |
|----------|-------|-----|----------|
| Critical | 1 | 0 | 1 |
| High | 59 | 0 | 59 |
| Medium | 0 | 0 | 0 |
| Low | 0 | 0 | 0 |

Risk Score: 81.8/100 — all 60 pre-existing findings in Go backend infra layer.

WO-027 adds only frontend TypeScript/CSS files (DrawerContext, Drawer, ErrorBoundary, App.tsx, Layout.tsx updates). 0 new findings.

Semgrep findings: 2 INFO/WARNING — both below high threshold and pre-existing (unsafe-formatstring INFO in ErrorBoundary.tsx console.error call; missing-integrity WARNING in auto-generated report HTML).
