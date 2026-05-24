mock_provider "google" {}

variables {
  project_id  = "boba-test"
  region      = "us-central1"
  environment = "dev"
}

run "docker_repo_created" {
  command = plan

  assert {
    condition     = google_artifact_registry_repository.containers.format == "DOCKER"
    error_message = "Repository must be a DOCKER format registry."
  }

  assert {
    condition     = google_artifact_registry_repository.containers.repository_id == "boba-containers-dev"
    error_message = "Repository ID must be suffixed with the environment."
  }
}

run "mutable_tags_for_latest" {
  command = plan

  assert {
    condition     = google_artifact_registry_repository.containers.docker_config[0].immutable_tags == false
    error_message = "Tags must be mutable so 'latest' can be re-pointed."
  }
}

run "cleanup_policies_present" {
  command = plan

  assert {
    condition     = length(google_artifact_registry_repository.containers.cleanup_policies) == 2
    error_message = "Repository must define keep-recent and delete-untagged cleanup policies."
  }
}

run "writer_iam_bound" {
  command = plan

  variables {
    writer_members = ["serviceAccount:boba-cicd-dev@boba-test.iam.gserviceaccount.com"]
  }

  assert {
    condition     = length(google_artifact_registry_repository_iam_member.writers) == 1
    error_message = "CI/CD deployer must be granted artifactregistry.writer."
  }
}

run "rejects_invalid_environment" {
  command = plan

  variables {
    environment = "qa"
  }

  expect_failures = [
    var.environment,
  ]
}
