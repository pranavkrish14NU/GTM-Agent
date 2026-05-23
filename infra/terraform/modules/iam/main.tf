locals {
  # One entry per service boundary. account_id stays <= 30 chars including the
  # environment suffix to satisfy GCP service account naming limits.
  service_accounts = {
    api-gateway = {
      account_id   = "boba-api-gw-${var.environment}"
      display_name = "BOBA API Gateway (${var.environment})"
      description  = "Runtime identity for the API gateway service."
      roles        = var.api_gateway_roles
    }
    worker-pods = {
      account_id   = "boba-worker-${var.environment}"
      display_name = "BOBA Worker Pods (${var.environment})"
      description  = "Runtime identity for async worker pods."
      roles        = var.worker_pods_roles
    }
    ci-cd-deployer = {
      account_id   = "boba-cicd-${var.environment}"
      display_name = "BOBA CI/CD Deployer (${var.environment})"
      description  = "Identity used by the deployment pipeline to ship to GKE."
      roles        = var.ci_cd_deployer_roles
    }
  }

  # Flatten {sa => [roles]} into a unique-keyed map of {sa:role} so each binding
  # is an independent resource instance.
  sa_role_bindings = merge([
    for sa_key, sa in local.service_accounts : {
      for role in sa.roles : "${sa_key}::${role}" => {
        sa_key = sa_key
        role   = role
      }
    }
  ]...)
}

resource "google_service_account" "this" {
  for_each = local.service_accounts

  project      = var.project_id
  account_id   = each.value.account_id
  display_name = each.value.display_name
  description  = each.value.description
}

resource "google_project_iam_member" "bindings" {
  for_each = local.sa_role_bindings

  project = var.project_id
  role    = each.value.role
  member  = "serviceAccount:${google_service_account.this[each.value.sa_key].email}"
}
