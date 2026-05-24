output "cluster_name" {
  description = "GKE cluster name."
  value       = google_container_cluster.this.name
}

output "cluster_id" {
  description = "Fully-qualified GKE cluster ID."
  value       = google_container_cluster.this.id
}

output "cluster_endpoint" {
  description = "Private control plane endpoint."
  value       = google_container_cluster.this.endpoint
  sensitive   = true
}

output "cluster_ca_certificate" {
  description = "Base64 cluster CA certificate."
  value       = google_container_cluster.this.master_auth[0].cluster_ca_certificate
  sensitive   = true
}

output "workload_identity_pool" {
  description = "Workload Identity pool (PROJECT.svc.id.goog)."
  value       = local.workload_pool
}

output "node_pool_names" {
  description = "Names of the managed node pools."
  value       = [google_container_node_pool.general.name, google_container_node_pool.worker.name]
}
