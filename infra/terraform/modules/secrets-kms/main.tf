locals {
  api    = "serviceAccount:${var.api_gateway_sa_email}"
  worker = "serviceAccount:${var.worker_pods_sa_email}"

  # Envelope-encryption keys for application data categories.
  kms_keys = ["oauth-tokens", "database-credentials", "llm-api-keys"]

  # Service accounts allowed to encrypt/decrypt with each key.
  kms_key_users = {
    "oauth-tokens"         = [local.api, local.worker]
    "database-credentials" = [local.api, local.worker]
    "llm-api-keys"         = [local.api, local.worker]
  }

  # Each secret maps to the least-privilege set of accessors that need it.
  secrets = {
    "db-password"                = [local.api, local.worker]
    "google-oauth-client-secret" = [local.api]
    "openai-api-key"             = [local.api, local.worker]
    "anthropic-api-key"          = [local.api, local.worker]
    "jwt-signing-key"            = [local.api]
  }

  # Flatten {key x member} and {secret x member} into unique-keyed maps.
  kms_iam_pairs = merge([
    for k, members in local.kms_key_users : {
      for m in members : "${k}::${m}" => { key = k, member = m }
    }
  ]...)

  secret_iam_pairs = merge([
    for s, members in local.secrets : {
      for m in members : "${s}::${m}" => { secret = s, member = m }
    }
  ]...)
}

# --- Cloud KMS ---
resource "google_kms_key_ring" "this" {
  name     = "boba-${var.environment}"
  project  = var.project_id
  location = var.region
}

resource "google_kms_crypto_key" "keys" {
  for_each = toset(local.kms_keys)

  name            = each.value
  key_ring        = google_kms_key_ring.this.id
  purpose         = "ENCRYPT_DECRYPT"
  rotation_period = "${var.key_rotation_period_seconds}s"

  # Guard against destroying a key that may have encrypted live data.
  lifecycle {
    prevent_destroy = true
  }
}

resource "google_kms_crypto_key_iam_member" "key_users" {
  for_each = local.kms_iam_pairs

  crypto_key_id = google_kms_crypto_key.keys[each.value.key].id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = each.value.member
}

# --- Secret Manager ---
# Secret containers only; values are injected manually or via CI/CD (out of scope).
resource "google_secret_manager_secret" "secrets" {
  for_each = local.secrets

  project   = var.project_id
  secret_id = "boba-${each.key}-${var.environment}"

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    managed-by  = "terraform"
    component   = "secrets"
  }
}

resource "google_secret_manager_secret_iam_member" "secret_accessors" {
  for_each = local.secret_iam_pairs

  project   = var.project_id
  secret_id = google_secret_manager_secret.secrets[each.value.secret].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = each.value.member
}
