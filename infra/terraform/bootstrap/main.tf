# One-time bootstrap: provision the GCS bucket that stores remote Terraform
# state for every environment. Run this once with local state, then point the
# root configuration's gcs backend at the bucket it outputs.
module "state_backend" {
  source = "../modules/state-backend"

  project_id  = var.project_id
  bucket_name = var.state_bucket_name
  location    = var.state_bucket_location

  labels = {
    managed-by = "terraform"
    component  = "tf-state"
    project    = "boba"
  }
}
