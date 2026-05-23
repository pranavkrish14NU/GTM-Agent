output "bucket_name" {
  description = "Name of the Terraform state bucket (use as the gcs backend `bucket`)."
  value       = google_storage_bucket.tfstate.name
}

output "bucket_url" {
  description = "gs:// URL of the state bucket."
  value       = google_storage_bucket.tfstate.url
}

output "bucket_self_link" {
  description = "Self link of the state bucket."
  value       = google_storage_bucket.tfstate.self_link
}
