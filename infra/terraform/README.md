# BOBA Infrastructure — Terraform Foundation (WO-001)

Terraform-managed GCP foundation for the BOBA platform: project APIs, a custom
VPC with private app/data subnets, Cloud NAT egress, least-privilege firewall
rules, Private Service Access for managed data services, per-boundary IAM
service accounts, and a versioned remote state bucket.

This is the first infrastructure work order — every later infra and application
work order builds on the network, IAM, and state store created here.

## Layout

```
infra/terraform/
├── bootstrap/                 # one-time: creates the GCS state bucket (local state)
├── environments/              # per-environment variable overrides
│   ├── dev.tfvars
│   ├── staging.tfvars
│   └── production.tfvars
├── modules/
│   ├── networking/            # VPC, subnets, NAT, firewall, Private Service Access
│   ├── iam/                   # api-gateway / worker-pods / ci-cd-deployer service accounts
│   ├── project-services/      # enables required GCP APIs
│   ├── state-backend/         # GCS state bucket (versioned, locked, private)
│   └── gke/                   # private regional GKE cluster, autoscaling node pools, Workload Identity (WO-002)
├── backend.tf                 # gcs backend (bucket supplied at init time)
├── main.tf                    # composes the modules
├── variables.tf / outputs.tf
└── versions.tf                # provider + version pins
```

## Prerequisites

- Terraform >= 1.7
- `gcloud` authenticated with rights to create networking, IAM, and storage
  resources in the target project(s): `gcloud auth application-default login`

## 1. Bootstrap the state bucket (once per platform)

```bash
cd infra/terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars   # fill in project_id + unique bucket name
terraform init
terraform apply
# note the state_bucket_name output
```

## 2. Provision an environment

State is namespaced per Terraform workspace (`dev`, `staging`, `production`).

```bash
cd infra/terraform
terraform init -backend-config="bucket=<state_bucket_name-from-bootstrap>"

# dev
terraform workspace select dev || terraform workspace new dev
terraform plan  -var-file=environments/dev.tfvars
terraform apply -var-file=environments/dev.tfvars

# staging / production: repeat with the matching workspace + tfvars
```

The root config asserts that the selected workspace matches `var.environment`,
so a `staging` plan cannot accidentally run in the `dev` workspace.

## Testing

Modules ship native Terraform tests that run fully offline using
`mock_provider` (no GCP credentials needed):

```bash
# per module
cd infra/terraform/modules/networking && terraform init -backend=false && terraform test

# format + schema validation for the whole tree
terraform fmt -recursive -check
terraform validate   # run inside each module / the root after `terraform init`
```

> Note: some local HTTPS-scanning antivirus products (e.g. AVG/Avast Web
> Shield) intercept Terraform's localhost plugin connection and cause
> `x509: certificate signed by unknown authority`. Pause the shield or exclude
> `terraform.exe` if `validate`/`test` fail with that error.

## Acceptance criteria mapping (WO-001)

| Criterion | Where |
|-----------|-------|
| `terraform plan` for dev/staging/production | root config + `environments/*.tfvars` + workspaces |
| VPC with ≥2 private subnets (app, data) | `modules/networking` |
| Cloud NAT egress | `modules/networking` (router + NAT) |
| Least-privilege firewall (443 to LB, internal, deny all else) | `modules/networking/firewall.tf` |
| IAM SAs: api-gateway, worker-pods, ci-cd-deployer | `modules/iam` |
| GCS state bucket with versioning + locking | `modules/state-backend` + `bootstrap` + `backend.tf` |
| Validated via `terraform validate` / `test` | `modules/**/tests/*.tftest.hcl` |

## WO-002 — GKE cluster

`modules/gke` provisions a private, regional, VPC-native GKE cluster wired into
WO-001's VPC and IAM:

| Criterion | Where |
|-----------|-------|
| Private cluster, no public endpoint | `private_cluster_config` (`enable_private_endpoint = true`) |
| Two node pools: general (e2-standard-4, 2-10) + worker (e2-highmem-4, 2-20) | `google_container_node_pool.general` / `.worker` |
| Cluster autoscaler on both pools | `autoscaling { total_min/total_max }` |
| Workload Identity + KSA→GSA mapping | `workload_identity_config` + `google_service_account_iam_member.workload_identity` |
| Network policy enforcement | Dataplane V2 (`datapath_provider = "ADVANCED_DATAPATH"`) |
| Authorized networks = CI/CD only | `gke_master_authorized_networks` (per-env tfvars) |

> Nodes run as WO-001's `worker-pods` service account. Because the control
> plane has no public endpoint, CI/CD must reach it from within the VPC (set
> `gke_master_authorized_networks` to in-VPC/CI ranges).
