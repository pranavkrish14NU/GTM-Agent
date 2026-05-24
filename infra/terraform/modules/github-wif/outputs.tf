output "pool_name" {
  description = "Full resource name of the Workload Identity Pool."
  value       = google_iam_workload_identity_pool.github.name
}

output "pool_provider_name" {
  description = "Full resource name of the WIF provider — use as WIF_PROVIDER in GitHub Actions."
  value       = google_iam_workload_identity_pool_provider.github_oidc.name
}

output "pool_id" {
  description = "Short pool ID (without project prefix)."
  value       = google_iam_workload_identity_pool.github.workload_identity_pool_id
}
