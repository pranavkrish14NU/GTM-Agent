# Root configuration for the BOBA infrastructure foundation (WO-001).
# Identical across environments; per-environment values come from
# environments/<env>.tfvars and the selected Terraform workspace.

locals {
  # Fail fast if the selected workspace and the environment variable disagree,
  # which would otherwise write one environment's state under another's name.
  workspace_matches_env = terraform.workspace == "default" || terraform.workspace == var.environment
}

resource "terraform_data" "guard_workspace" {
  lifecycle {
    precondition {
      condition     = local.workspace_matches_env
      error_message = "Selected workspace '${terraform.workspace}' does not match var.environment '${var.environment}'. Run: terraform workspace select ${var.environment}"
    }
  }
}

module "project_services" {
  source = "./modules/project-services"

  project_id = var.project_id
}

module "networking" {
  source = "./modules/networking"

  project_id              = var.project_id
  region                  = var.region
  environment             = var.environment
  network_name            = var.network_name
  app_subnet_cidr         = var.app_subnet_cidr
  data_subnet_cidr        = var.data_subnet_cidr
  pods_secondary_cidr     = var.pods_secondary_cidr
  services_secondary_cidr = var.services_secondary_cidr
  enable_iap_ssh          = var.enable_iap_ssh

  # Networking depends on the Compute and Service Networking APIs being live.
  depends_on = [module.project_services]
}

module "iam" {
  source = "./modules/iam"

  project_id  = var.project_id
  environment = var.environment

  depends_on = [module.project_services]
}

module "gke" {
  source = "./modules/gke"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  # Consume the VPC, app subnet, and GKE secondary ranges from WO-001.
  network             = module.networking.network_self_link
  subnetwork          = module.networking.app_subnet_self_link
  pods_range_name     = module.networking.pods_secondary_range_name
  services_range_name = module.networking.services_secondary_range_name

  # Nodes run as the worker-pods service account from WO-001 (least privilege).
  node_service_account = module.iam.worker_pods_sa_email

  master_ipv4_cidr           = var.gke_master_ipv4_cidr
  enable_private_endpoint    = var.gke_enable_private_endpoint
  master_authorized_networks = var.gke_master_authorized_networks
  deletion_protection        = var.gke_deletion_protection

  depends_on = [module.project_services, module.networking, module.iam]
}

module "cloud_sql" {
  source = "./modules/cloud-sql"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  # Private IP over WO-001's VPC + Private Service Access peering.
  network = module.networking.network_self_link

  tier                = var.cloud_sql_tier
  replica_tier        = var.cloud_sql_tier
  deletion_protection = var.cloud_sql_deletion_protection

  # Grant the runtime service accounts read access to the DB credentials secret.
  secret_accessor_members = [
    "serviceAccount:${module.iam.api_gateway_sa_email}",
    "serviceAccount:${module.iam.worker_pods_sa_email}",
  ]

  # Cloud SQL private IP requires the service networking connection from WO-001.
  depends_on = [module.project_services, module.networking, module.iam]
}

module "redis" {
  source = "./modules/redis"

  project_id  = var.project_id
  region      = var.region
  environment = var.environment

  network        = module.networking.network_self_link
  memory_size_gb = var.redis_memory_size_gb

  secret_accessor_members = [
    "serviceAccount:${module.iam.api_gateway_sa_email}",
    "serviceAccount:${module.iam.worker_pods_sa_email}",
  ]

  # Redis private service access requires the WO-001 service networking connection.
  depends_on = [module.project_services, module.networking, module.iam]
}
