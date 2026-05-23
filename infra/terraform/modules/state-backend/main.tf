# GCS bucket backing the Terraform `gcs` backend. The gcs backend performs
# state locking natively via a lock object, so no separate lock resource is
# needed — versioning here gives recoverable history of every state write.
resource "google_storage_bucket" "tfstate" {
  name     = var.bucket_name
  project  = var.project_id
  location = var.location

  # Object versioning preserves prior state files; combined with the gcs
  # backend's lock object this satisfies "versioning + state locking".
  versioning {
    enabled = true
  }

  # IAM-only access (no legacy per-object ACLs) and block any public exposure
  # of state, which can contain sensitive values.
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # Guard against accidental `terraform destroy` wiping the state store.
  force_destroy = false

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      num_newer_versions = var.noncurrent_versions_to_keep
      with_state         = "ARCHIVED"
    }
  }

  labels = var.labels
}
