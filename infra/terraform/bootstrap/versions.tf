terraform {
  required_version = ">= 1.7.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0, < 7.0"
    }
  }

  # Bootstrap intentionally uses local state: it creates the very bucket that
  # the root configuration's gcs backend will later use. Commit the resulting
  # bootstrap state, or re-import, if you need to manage the bucket long-term.
}

provider "google" {
  project = var.project_id
  region  = var.region
}
