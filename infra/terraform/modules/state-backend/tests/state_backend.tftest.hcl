mock_provider "google" {}

variables {
  project_id  = "boba-test"
  bucket_name = "boba-tfstate-test"
}

run "state_bucket_is_versioned" {
  command = plan

  assert {
    condition     = google_storage_bucket.tfstate.versioning[0].enabled == true
    error_message = "State bucket must enable object versioning for recoverable state history."
  }
}

run "state_bucket_is_locked_down" {
  command = plan

  assert {
    condition     = google_storage_bucket.tfstate.uniform_bucket_level_access == true
    error_message = "State bucket must use uniform bucket-level access (no legacy ACLs)."
  }

  assert {
    condition     = google_storage_bucket.tfstate.public_access_prevention == "enforced"
    error_message = "State bucket must enforce public access prevention."
  }

  assert {
    condition     = google_storage_bucket.tfstate.force_destroy == false
    error_message = "State bucket must not be force-destroyable."
  }
}

run "state_bucket_retains_history" {
  command = plan

  assert {
    condition     = length(google_storage_bucket.tfstate.lifecycle_rule) >= 1
    error_message = "State bucket must define a lifecycle rule to prune old versions."
  }
}
