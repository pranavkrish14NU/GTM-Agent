mock_provider "google" {}

variables {
  project_id = "boba-test"
}

run "enables_core_platform_apis" {
  command = plan

  assert {
    condition     = contains(keys(google_project_service.apis), "compute.googleapis.com")
    error_message = "Compute API is required for the VPC, subnets, router and NAT."
  }

  assert {
    condition     = contains(keys(google_project_service.apis), "servicenetworking.googleapis.com")
    error_message = "Service Networking API is required for Private Service Access (Cloud SQL/Redis)."
  }

  assert {
    condition     = contains(keys(google_project_service.apis), "container.googleapis.com")
    error_message = "Container API is required for the GKE cluster (WO-002)."
  }

  assert {
    condition     = contains(keys(google_project_service.apis), "secretmanager.googleapis.com")
    error_message = "Secret Manager API is required for credentials (WO-006)."
  }
}

run "does_not_disable_on_destroy_by_default" {
  command = plan

  assert {
    condition     = alltrue([for s in google_project_service.apis : s.disable_on_destroy == false])
    error_message = "APIs must not be disabled on destroy to avoid disrupting shared projects."
  }
}
