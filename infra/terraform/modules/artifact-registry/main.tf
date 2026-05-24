# Docker repository for BOBA service images. Vulnerability scanning is enabled
# at the project level via the Container Scanning API (containerscanning.
# googleapis.com, enabled in the project-services module) — Artifact Registry
# then automatically scans pushed images.
resource "google_artifact_registry_repository" "containers" {
  project       = var.project_id
  location      = var.region
  repository_id = "${var.repository_id}-${var.environment}"
  format        = "DOCKER"
  description   = "BOBA container images (${var.environment})"

  docker_config {
    # `latest` must be re-taggable, so tags are mutable.
    immutable_tags = false
  }

  # Retain the most-recent tagged revisions; prune stale untagged images.
  cleanup_policies {
    id     = "keep-recent-tagged"
    action = "KEEP"
    most_recent_versions {
      keep_count = var.keep_tagged_revisions
    }
  }

  cleanup_policies {
    id     = "delete-old-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = var.untagged_ttl
    }
  }

  labels = {
    environment = var.environment
    managed-by  = "terraform"
    component   = "artifact-registry"
  }
}

resource "google_artifact_registry_repository_iam_member" "writers" {
  for_each = toset(var.writer_members)

  project    = var.project_id
  location   = google_artifact_registry_repository.containers.location
  repository = google_artifact_registry_repository.containers.repository_id
  role       = "roles/artifactregistry.writer"
  member     = each.value
}
