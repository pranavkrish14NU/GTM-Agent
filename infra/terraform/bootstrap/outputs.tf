output "state_bucket_name" {
  description = "Name of the created state bucket. Use this as the gcs backend `bucket` for the root configuration."
  value       = module.state_backend.bucket_name
}

output "state_bucket_url" {
  description = "gs:// URL of the state bucket."
  value       = module.state_backend.bucket_url
}
