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
