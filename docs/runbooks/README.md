# BOBA Operational Runbooks

Runbooks for on-call engineers and SREs. Each runbook follows a consistent structure:
**Symptoms → Diagnosis → Resolution → Verification → Escalation**.

| Runbook | Description |
|---------|-------------|
| [Database Backup and Restore](./database-backup-restore.md) | Cloud SQL PITR, named-backup restore, cutover procedure |
| [Service Scaling](./service-scaling.md) | Manual scaling of API and worker pods, HPA override, limits |
| [Incident Response](./incident-response.md) | Severity classification, escalation matrix, communication templates, post-mortem |
| [Drive Sync Troubleshooting](./drive-sync-troubleshooting.md) | OAuth failures, stale page tokens, quota issues, re-trigger sync |
| [Common Errors](./common-errors.md) | 429 rate limits, LLM provider failures, DB connection exhaustion |

## Related Documentation

- [Deployment Runbook](../../deploy/RUNBOOK.md) — Cloud Deploy canary pipeline, rollback, monitoring
- [Infrastructure README](../../infra/terraform/README.md) — GCP Terraform modules
- [API Documentation](../../backend/api/src/openapi.ts) — OpenAPI 3.0 spec (served at `/api-spec.json`)

## On-Call Quick Reference

```
P1 → PagerDuty boba-platform (15 min SLA)
P2 → PagerDuty boba-platform (30 min SLA)
Slack incidents channel: #incidents
Incident channel naming: #incident-YYYYMMDD-<short-desc>
```
