# BOBA Infrastructure — One-Time Setup Guide

This guide walks through every manual step required to bootstrap the BOBA platform
on GCP from scratch. Run it **once per platform lifetime** (not per deploy).

---

## Overview

```
Step 1 — Create GCP projects (dev / staging / production)
Step 2 — Bootstrap the Terraform state bucket
Step 3 — Configure GitHub repository variables & secrets
Step 4 — Provision dev environment via Terraform
Step 5 — Provision staging environment via Terraform
Step 6 — Provision production environment via Terraform
Step 7 — Register the Cloud Deploy pipeline
Step 8 — Seed application secrets in Secret Manager
Step 9 — Verify the deployment pipeline end-to-end
```

---

## Prerequisites

- `gcloud` CLI authenticated as a user with `Owner` on each project:
  ```bash
  gcloud auth login
  gcloud auth application-default login
  ```
- Terraform >= 1.8:
  ```bash
  brew install terraform          # macOS
  # or https://developer.hashicorp.com/terraform/install
  terraform version
  ```
- GitHub CLI (`gh`) authenticated:
  ```bash
  gh auth login
  ```
- AVG/Avast/similar AV: pause the HTTPS scanning shield or add a Terraform exclusion
  before running `terraform init` (see [infra/terraform/README.md](terraform/README.md)).

---

## Step 1 — Create GCP Projects

Create **three separate GCP projects** (one per environment). Using separate projects
provides billing isolation, IAM blast-radius reduction, and independent quota pools.

```bash
# Replace the project IDs below with your actual choices.
# Project IDs must be globally unique across all of GCP.

gcloud projects create boba-dev-<SUFFIX>   --name="BOBA Dev"
gcloud projects create boba-staging-<SUFFIX> --name="BOBA Staging"
gcloud projects create boba-prod-<SUFFIX>  --name="BOBA Production"

# Link billing account to each project (required before APIs can be enabled)
BILLING=$(gcloud billing accounts list --format="value(name)" | head -1)
gcloud billing projects link boba-dev-<SUFFIX>     --billing-account=$BILLING
gcloud billing projects link boba-staging-<SUFFIX> --billing-account=$BILLING
gcloud billing projects link boba-prod-<SUFFIX>    --billing-account=$BILLING
```

Note your three project IDs — you'll need them in the steps below.

---

## Step 2 — Bootstrap the Terraform State Bucket

The bootstrap module creates the GCS bucket that stores all Terraform state.
It uses **local state** (no backend) since it runs once.

```bash
cd infra/terraform/bootstrap

# Copy and fill in the example vars
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:
```hcl
project_id        = "boba-dev-<SUFFIX>"          # state bucket lives in dev project
state_bucket_name = "boba-tfstate-<SUFFIX>"       # globally unique GCS bucket name
region            = "us-central1"
```

```bash
terraform init
terraform apply

# Note the output:
terraform output state_bucket_name
# → boba-tfstate-<SUFFIX>
```

---

## Step 3 — Configure GitHub Repository Variables & Secrets

Go to **GitHub → Settings → Secrets and variables → Actions** and add:

### Repository Variables (non-sensitive)

| Variable | Value | Notes |
|----------|-------|-------|
| `TF_STATE_BUCKET` | `boba-tfstate-<SUFFIX>` | From Step 2 output |
| `GCP_PROJECT` | `boba-prod-<SUFFIX>` | Production project ID |
| `AR_LOCATION` | `us-central1` | Artifact Registry region |
| `AR_REPOSITORY` | `boba` | AR repository name (created by Terraform) |
| `WIF_PROVIDER` | `projects/<NUMBER>/locations/global/workloadIdentityPools/boba-github/providers/boba-github` | From Terraform output after Step 4 |
| `CICD_SA_EMAIL` | `ci-cd-deployer@boba-dev-<SUFFIX>.iam.gserviceaccount.com` | From Terraform output |
| `DEPLOY_ENABLED` | `true` | Enables the CD pipeline (app deploys) |
| `INFRA_ENABLED` | `false` | Set to `true` only when ready to auto-apply dev infra |

### Repository Secrets (sensitive)

| Secret | Value |
|--------|-------|
| `SLACK_AUTH_TOKEN` | Slack OAuth token for monitoring alerts (optional) |

### Environment-Level Approval (for staging + production apply)

In **GitHub → Settings → Environments**, create `staging` and `production` environments
and add required reviewers. This gates the `terraform apply` job.

---

## Step 4 — Provision Dev Environment

```bash
cd infra/terraform

# Update dev.tfvars with your real project ID
sed -i 's/boba-dev-000000/boba-dev-<SUFFIX>/g' environments/dev.tfvars
# Also set monitoring_notification_email to a real address

terraform init \
  -backend-config="bucket=boba-tfstate-<SUFFIX>" \
  -backend-config="prefix=boba/dev"

terraform workspace select dev || terraform workspace new dev

terraform plan  -var-file=environments/dev.tfvars
terraform apply -var-file=environments/dev.tfvars
```

After apply, capture the outputs:
```bash
terraform output -json | tee infra-outputs-dev.json
```

Key outputs to note:
- `wif_provider_name` → set as `WIF_PROVIDER` GitHub variable
- `ci_cd_deployer_sa_email` → set as `CICD_SA_EMAIL` GitHub variable
- `artifact_registry_repository` → confirm matches `AR_REPOSITORY` variable
- `gke_cluster_name` → for kubectl configuration

---

## Step 5 — Provision Staging Environment

```bash
# Update staging.tfvars
sed -i 's/boba-staging-000000/boba-staging-<SUFFIX>/g' environments/staging.tfvars

terraform workspace select staging || terraform workspace new staging

terraform plan  -var-file=environments/staging.tfvars
terraform apply -var-file=environments/staging.tfvars
```

---

## Step 6 — Provision Production Environment

> ⚠️ Production has `deletion_protection = true` on GKE and Cloud SQL.
> This is intentional and prevents accidental destruction.

```bash
# Update production.tfvars
sed -i 's/boba-prod-000000/boba-prod-<SUFFIX>/g' environments/production.tfvars
# Set monitoring_notification_email = "ops@yourcompany.com"

terraform workspace select production || terraform workspace new production

terraform plan  -var-file=environments/production.tfvars
terraform apply -var-file=environments/production.tfvars
```

---

## Step 7 — Register the Cloud Deploy Pipeline

This registers the BOBA delivery pipeline, targets, and rollback Automation
in Cloud Deploy. Run **once per project** (idempotent on repeat).

```bash
export PROD_PROJECT="boba-prod-<SUFFIX>"
export REGION="us-central1"

# Register the pipeline (staging + production targets + canary strategy)
gcloud deploy apply \
  --file=deploy/clouddeploy.yaml \
  --region="${REGION}" \
  --project="${PROD_PROJECT}"

# Verify
gcloud deploy delivery-pipelines list \
  --region="${REGION}" \
  --project="${PROD_PROJECT}"
```

---

## Step 8 — Seed Application Secrets in Secret Manager

The Terraform `secrets-kms` module creates the Secret Manager secret **names** but
not the **values** (secrets have no default values). Seed each environment:

### Database credentials
```bash
# The Cloud SQL module already creates a random password and stores it in
# boba-db-credentials-<env>. Verify it exists:
gcloud secrets versions access latest \
  --secret="boba-db-credentials-dev" \
  --project="boba-dev-<SUFFIX>" \
  --format="json" | jq .
```

### Google OAuth credentials (for Drive integration)
```bash
# Create an OAuth 2.0 client ID in GCP Console:
# APIs & Services → Credentials → Create OAuth 2.0 Client ID
# Authorized redirect URIs: https://api.boba.example.com/v1/auth/callback

# Store the client credentials
echo -n '{"client_id":"<OAUTH_CLIENT_ID>","client_secret":"<OAUTH_CLIENT_SECRET>"}' | \
  gcloud secrets versions add boba-google-oauth-credentials \
    --data-file=- \
    --project="boba-prod-<SUFFIX>"
```

### JWT signing key (RS256)
```bash
# Generate an RSA-2048 key pair for JWT signing
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem
openssl rsa -pubout -in private.pem -out public.pem

# Store in Secret Manager
gcloud secrets versions add boba-jwt-private-key \
  --data-file=private.pem \
  --project="boba-prod-<SUFFIX>"

gcloud secrets versions add boba-jwt-public-key \
  --data-file=public.pem \
  --project="boba-prod-<SUFFIX>"

# Remove local key files immediately
rm private.pem public.pem
```

### LLM provider API keys
```bash
# OpenAI
echo -n "sk-..." | gcloud secrets versions add boba-openai-api-key \
  --data-file=- --project="boba-prod-<SUFFIX>"

# Anthropic (optional)
echo -n "sk-ant-..." | gcloud secrets versions add boba-anthropic-api-key \
  --data-file=- --project="boba-prod-<SUFFIX>"
```

---

## Step 9 — Verify End-to-End

### 9a. Connect kubectl to the cluster

```bash
gcloud container clusters get-credentials boba-prod \
  --region=us-central1 \
  --project="boba-prod-<SUFFIX>"

kubectl get nodes -n boba
```

### 9b. Run a database migration

```bash
# From within the VPC (or via Cloud SQL Auth Proxy):
cloud-sql-proxy --address 127.0.0.1 --port 5432 \
  "boba-prod-<SUFFIX>:us-central1:boba-db-production" &

psql "host=127.0.0.1 port=5432 dbname=boba user=boba sslmode=require" <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;
-- Run application migrations here
\q
SQL
```

### 9c. Trigger the first CD pipeline run

```bash
# Push a commit to main (after merging infra/setup PR) to trigger CI → CD
# OR manually enable DEPLOY_ENABLED=true in GitHub repo vars and re-run CI
```

### 9d. Confirm Cloud Deploy pipeline

```bash
gcloud deploy delivery-pipelines describe boba-pipeline \
  --region=us-central1 \
  --project="boba-prod-<SUFFIX>"
```

Expected: pipeline shows `boba-staging → boba-production` serial progression.

---

## Environment tfvars — Placeholder Replacements

After creating your GCP projects, do a find-and-replace in `infra/terraform/environments/`:

| Placeholder | Replace With |
|-------------|-------------|
| `boba-dev-000000` | Your dev project ID |
| `boba-staging-000000` | Your staging project ID |
| `boba-prod-000000` | Your production project ID |
| `ops-staging@boba.example.com` | Your staging ops email |
| `ops@boba.example.com` | Your production ops email |

---

## Troubleshooting

### `x509: certificate signed by unknown authority` during `terraform init`

AVG/Avast Web Shield is intercepting Terraform's plugin download. Pause the HTTPS
shield or add `terraform.exe` to the exclusion list.

### `Error: required APIs not enabled`

The `project-services` module enables all required APIs but they take 1–2 min to
propagate. Re-run `terraform apply` after waiting.

### `Error: Invalid Argument — gke_master_authorized_networks`

The GKE private endpoint requires the master authorized networks to include
in-VPC ranges. Confirm `gke_master_authorized_networks` in your tfvars includes
at least the `app_subnet_cidr` CIDR.

### Cloud Deploy `PERMISSION_DENIED`

The `ci-cd-deployer` service account needs `roles/clouddeploy.releaser` on the
production project. The `iam` module grants this — confirm Terraform applied successfully.

---

## Post-Setup Checklist

- [ ] All three GCP projects created and billing linked
- [ ] State bucket created (`terraform output` shows `state_bucket_name`)
- [ ] GitHub variables set (`WIF_PROVIDER`, `CICD_SA_EMAIL`, `TF_STATE_BUCKET`, etc.)
- [ ] Dev environment applied — GKE, Cloud SQL, Redis, queues all `RUNNING`
- [ ] Staging environment applied
- [ ] Production environment applied
- [ ] Cloud Deploy pipeline registered and visible in GCP Console
- [ ] Application secrets seeded (OAuth, JWT keys, LLM keys)
- [ ] Database migrations run (`CREATE EXTENSION vector;` confirmed)
- [ ] First CD pipeline run completed — staging deployment succeeds
- [ ] Production promotion tested manually (10% canary → 50% → stable)
