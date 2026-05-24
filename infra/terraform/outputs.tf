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

output "cloud_sql_connection_name" {
  description = "Cloud SQL primary connection name."
  value       = module.cloud_sql.connection_name
}

output "cloud_sql_replica_connection_name" {
  description = "Cloud SQL read replica connection name."
  value       = module.cloud_sql.replica_connection_name
}

output "cloud_sql_credentials_secret" {
  description = "Secret Manager secret ID holding DB credentials."
  value       = module.cloud_sql.credentials_secret_id
}

output "redis_host" {
  description = "Redis private IP."
  value       = module.redis.host
}

output "cloud_armor_policy" {
  description = "Cloud Armor security policy name (attach to backend services / Ingress)."
  value       = module.cloud_armor.security_policy_name
}

output "redis_credentials_secret" {
  description = "Secret Manager secret ID holding Redis host/port/AUTH."
  value       = module.redis.credentials_secret_id
}

output "cloud_tasks_queues" {
  description = "Cloud Tasks processing queue names."
  value       = module.cloud_tasks.queue_names
}

output "cloud_tasks_dead_letter_queue" {
  description = "Cloud Tasks dead-letter queue name."
  value       = module.cloud_tasks.dead_letter_queue_name
}

output "kms_key_ring" {
  description = "KMS key ring ID."
  value       = module.secrets_kms.key_ring_id
}

output "secret_ids" {
  description = "Map of logical secret name -> Secret Manager secret ID."
  value       = module.secrets_kms.secret_ids
}

output "artifact_registry_url" {
  description = "Docker registry URL for pushing/pulling BOBA service images."
  value       = module.artifact_registry.registry_url
}

output "audit_log_bucket" {
  description = "GCS bucket name receiving audit logs (90-day retention)."
  value       = module.logging.audit_bucket_name
}

output "error_rate_metric" {
  description = "Cloud Logging log-based metric name for error rate per service."
  value       = module.logging.error_rate_metric_name
}
