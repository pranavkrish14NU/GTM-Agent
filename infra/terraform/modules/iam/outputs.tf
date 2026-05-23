output "service_account_emails" {
  description = "Map of service boundary -> service account email."
  value       = { for key, sa in google_service_account.this : key => sa.email }
}

output "service_account_ids" {
  description = "Map of service boundary -> fully-qualified service account ID."
  value       = { for key, sa in google_service_account.this : key => sa.id }
}

output "api_gateway_sa_email" {
  description = "API gateway service account email."
  value       = google_service_account.this["api-gateway"].email
}

output "worker_pods_sa_email" {
  description = "Worker pods service account email."
  value       = google_service_account.this["worker-pods"].email
}

output "ci_cd_deployer_sa_email" {
  description = "CI/CD deployer service account email."
  value       = google_service_account.this["ci-cd-deployer"].email
}
