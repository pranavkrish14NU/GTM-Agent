# GTM-Agent — BOBA

**BOBA** (Branding, Outreach, Buzz & Analytics) is an AI-powered go-to-market
command center that uses Google Drive as its primary knowledge repository to
deliver source-cited brand intelligence, competitor analysis, content
generation, and GTM analytics for marketing, sales, growth, and executive teams.

This repository holds the platform's infrastructure and (incrementally) its
application services, delivered work-order by work-order via Forge.

## Repository layout

| Path | Purpose |
|------|---------|
| `backend/api/` | Express + TypeScript API service — all `/v1/` endpoints. OpenAPI spec at `src/openapi.ts`. |
| `backend/worker/` | Async worker — Drive sync, embedding pipeline. |
| `deploy/` | Cloud Deploy pipeline (skaffold.yaml, clouddeploy.yaml) and deployment [RUNBOOK](deploy/RUNBOOK.md). |
| `docs/runbooks/` | **Operational runbooks** — database restore, service scaling, incident response, Drive sync, common errors. See [Runbooks README](docs/runbooks/README.md). |
| `infra/terraform/` | GCP infrastructure as code — VPC, IAM, state backend, GKE / Cloud SQL / Redis. See its [README](infra/terraform/README.md). |
| `CLAUDE.md` | Engineering standards and the Forge work-order workflow followed in this repo. |

## Architecture (target)

A layered, multi-tenant SaaS on GCP: React SPA → API gateway → domain services
(Auth, Drive Sync, RAG Pipeline, Insight Engine, Content Studio, Ask BOBA) →
async workers → PostgreSQL + pgvector / Redis. Google Drive remains the
canonical content source; only embeddings and metadata are persisted.

## Infrastructure quick start

```bash
cd infra/terraform/bootstrap        # one-time: create the remote state bucket
terraform init && terraform apply

cd ../                              # provision an environment
terraform init -backend-config="bucket=<state-bucket>"
terraform workspace select dev || terraform workspace new dev
terraform plan -var-file=environments/dev.tfvars
```

See [`infra/terraform/README.md`](infra/terraform/README.md) for the full guide,
module breakdown, and testing instructions.

## Status

Greenfield. First delivered foundation: **WO-001 — Terraform GCP Project and
Network Foundation**.

## License

Released under the [MIT License](LICENSE).
