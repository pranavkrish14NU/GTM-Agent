mock_provider "google" {}

variables {
  project_id  = "boba-test"
  environment = "dev"
}

run "creates_three_service_accounts" {
  command = plan

  assert {
    condition     = length(google_service_account.this) == 3
    error_message = "Exactly three service accounts (api-gateway, worker-pods, ci-cd-deployer) must be created."
  }

  assert {
    condition     = google_service_account.this["api-gateway"].account_id == "boba-api-gw-dev"
    error_message = "API gateway account_id must include the environment suffix."
  }

  assert {
    condition     = google_service_account.this["worker-pods"].account_id == "boba-worker-dev"
    error_message = "Worker pods account_id must include the environment suffix."
  }

  assert {
    condition     = google_service_account.this["ci-cd-deployer"].account_id == "boba-cicd-dev"
    error_message = "CI/CD deployer account_id must include the environment suffix."
  }
}

run "account_ids_within_gcp_length_limit" {
  command = plan

  assert {
    condition     = alltrue([for sa in google_service_account.this : length(sa.account_id) >= 6 && length(sa.account_id) <= 30])
    error_message = "Every service account_id must be 6-30 characters per GCP constraints."
  }
}

run "binds_least_privilege_roles" {
  command = plan

  # 6 + 6 + 4 default roles across the three accounts.
  assert {
    condition     = length(google_project_iam_member.bindings) == 16
    error_message = "Expected 16 role bindings from the default least-privilege role sets."
  }

  assert {
    condition     = anytrue([for b in google_project_iam_member.bindings : b.role == "roles/cloudtasks.enqueuer"])
    error_message = "API gateway must be able to enqueue Cloud Tasks."
  }

  assert {
    condition     = anytrue([for b in google_project_iam_member.bindings : b.role == "roles/container.developer"])
    error_message = "CI/CD deployer must hold roles/container.developer to deploy to GKE."
  }
}

run "no_owner_or_editor_roles" {
  command = plan

  assert {
    condition     = alltrue([for b in google_project_iam_member.bindings : !contains(["roles/owner", "roles/editor"], b.role)])
    error_message = "Service accounts must never receive primitive owner/editor roles."
  }
}

run "rejects_invalid_environment" {
  command = plan

  variables {
    environment = "prod"
  }

  expect_failures = [
    var.environment,
  ]
}
