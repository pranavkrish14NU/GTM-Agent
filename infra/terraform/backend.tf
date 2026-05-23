terraform {
  # Partial backend configuration. The bucket is supplied at init time so the
  # same code targets any project's state store:
  #
  #   terraform init -backend-config="bucket=<state-bucket-from-bootstrap>"
  #
  # State is namespaced per Terraform workspace (dev/staging/production) under
  # the prefix below, and the gcs backend locks state via a lock object.
  backend "gcs" {
    prefix = "boba/infra"
  }
}
