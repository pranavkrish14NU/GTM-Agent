# Pre-Commit Security Scan — Infrastructure Setup
**Date:** 2026-05-24 | **Verdict:** SAFE TO COMMIT — 0 Critical, 0 High

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| **Total** | **0** |

## Scanners Run

| Scanner | Status | Findings |
|---------|--------|----------|
| gitleaks (secrets) | PASSED | 0 |
| semgrep (SAST) | PASSED | 0 |
| checkov (IaC) | PASSED | 0 |
| manual secrets grep | PASSED | 0 (1 false positive: gcloud --secret= flag) |

## New Files

- `.github/workflows/infra.yml` — Terraform plan/apply CI/CD workflow
- `infra/SETUP.md` — One-time infrastructure provisioning guide
- `infra/terraform/modules/github-wif/main.tf` — GitHub Actions WIF pool + OIDC provider
- `infra/terraform/modules/github-wif/variables.tf`
- `infra/terraform/modules/github-wif/outputs.tf`
- `infra/terraform/modules/github-wif/versions.tf`
- `infra/terraform/bootstrap/terraform.tfvars.example` — Already existed (not modified)

## Modified Files

- `infra/terraform/main.tf` — Added github_wif module invocation
- `infra/terraform/variables.tf` — Added github_repository variable (default: pranavkrish14NU/GTM-Agent)
- `infra/terraform/outputs.tf` — Added wif_provider_name and ci_cd_deployer_sa_email outputs
- `infra/terraform/modules/iam/outputs.tf` — Added service_account_ids output for WIF binding

## Notes

No hardcoded credentials. The `--secret="boba-db-credentials-dev"` match is a gcloud CLI
`--secret` flag name in a shell command example (SETUP.md) — not a credential value.
All GCP project IDs use placeholder `boba-XXX-000000` / `REPLACE_ME` patterns.
WIF attribute_condition restricts authentication to the configured GitHub repository only.
