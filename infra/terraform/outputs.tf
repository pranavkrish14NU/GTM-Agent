output "network_self_link" {
  description = "VPC network self link for downstream modules (GKE, Cloud SQL, Redis)."
  value       = module.networking.network_self_link
}

output "app_subnet_self_link" {
  description = "App-tier subnet self link (GKE node subnet)."
  value       = module.networking.app_subnet_self_link
}

output "data_subnet_self_link" {
  description = "Data-tier subnet self link."
  value       = module.networking.data_subnet_self_link
}

output "gke_pods_range_name" {
  description = "Secondary range name for GKE pods."
  value       = module.networking.pods_secondary_range_name
}

output "gke_services_range_name" {
  description = "Secondary range name for GKE services."
  value       = module.networking.services_secondary_range_name
}

output "psa_range_name" {
  description = "Private Service Access range for Cloud SQL / Redis."
  value       = module.networking.psa_range_name
}

output "service_account_emails" {
  description = "Service boundary -> service account email."
  value       = module.iam.service_account_emails
}

output "enabled_apis" {
  description = "APIs enabled on the project."
  value       = module.project_services.enabled_apis
}

output "gke_cluster_name" {
  description = "GKE cluster name."
  value       = module.gke.cluster_name
}

output "gke_workload_identity_pool" {
  description = "GKE Workload Identity pool."
  value       = module.gke.workload_identity_pool
}

output "gke_node_pools" {
  description = "GKE node pool names."
  value       = module.gke.node_pool_names
}
