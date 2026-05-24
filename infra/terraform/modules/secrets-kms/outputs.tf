output "key_ring_id" {
  description = "KMS key ring ID."
  value       = google_kms_key_ring.this.id
}

output "crypto_key_ids" {
  description = "Map of key name -> KMS crypto key ID."
  value       = { for k, v in google_kms_crypto_key.keys : k => v.id }
}

output "secret_ids" {
  description = "Map of logical secret name -> Secret Manager secret ID."
  value       = { for k, v in google_secret_manager_secret.secrets : k => v.secret_id }
}
