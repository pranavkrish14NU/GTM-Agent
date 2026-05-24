mock_provider "google" {}

variables {
  project_id           = "boba-test"
  region               = "us-central1"
  environment          = "dev"
  api_gateway_sa_email = "boba-api-gw-dev@boba-test.iam.gserviceaccount.com"
  worker_pods_sa_email = "boba-worker-dev@boba-test.iam.gserviceaccount.com"
}

run "kms_keyring_and_keys" {
  command = plan

  assert {
    condition     = length(google_kms_crypto_key.keys) == 3
    error_message = "Three KMS crypto keys (oauth-tokens, database-credentials, llm-api-keys) must exist."
  }

  assert {
    condition     = google_kms_crypto_key.keys["oauth-tokens"].purpose == "ENCRYPT_DECRYPT"
    error_message = "Keys must be ENCRYPT_DECRYPT purpose."
  }
}

run "keys_rotate_every_90_days" {
  command = plan

  assert {
    condition     = alltrue([for k in google_kms_crypto_key.keys : k.rotation_period == "7776000s"])
    error_message = "All KMS keys must rotate every 90 days (7776000s)."
  }
}

run "five_secrets_created" {
  command = plan

  assert {
    condition     = length(google_secret_manager_secret.secrets) == 5
    error_message = "Five secrets must be created."
  }

  assert {
    # checkov:skip=CKV_SECRET_6: literal is a secret NAME asserted in a test, not a credential value (gitleaks confirms 0 secrets).
    condition     = google_secret_manager_secret.secrets["db-password"].secret_id == "boba-db-password-dev"
    error_message = "db-password secret must be named per environment."
  }
}

run "least_privilege_secret_access" {
  command = plan

  # db-password -> 2 SAs, oauth-client-secret -> 1, openai -> 2, anthropic -> 2, jwt -> 1 = 8 bindings.
  assert {
    condition     = length(google_secret_manager_secret_iam_member.secret_accessors) == 8
    error_message = "Secret accessor bindings must follow the least-privilege map (8 total)."
  }

  assert {
    condition     = alltrue([for b in google_secret_manager_secret_iam_member.secret_accessors : b.role == "roles/secretmanager.secretAccessor"])
    error_message = "Secret bindings must grant only secretAccessor."
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
