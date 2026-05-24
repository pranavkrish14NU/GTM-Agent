output "instance_name" {
  description = "Primary Cloud SQL instance name."
  value       = google_sql_database_instance.primary.name
}

output "connection_name" {
  description = "Primary instance connection name (project:region:instance) for the Cloud SQL Auth Proxy."
  value       = google_sql_database_instance.primary.connection_name
}

output "private_ip_address" {
  description = "Primary instance private IP."
  value       = google_sql_database_instance.primary.private_ip_address
}

output "replica_connection_name" {
  description = "Read replica connection name."
  value       = google_sql_database_instance.replica.connection_name
}

output "replica_private_ip_address" {
  description = "Read replica private IP."
  value       = google_sql_database_instance.replica.private_ip_address
}

output "database_name" {
  description = "Application database name."
  value       = google_sql_database.app.name
}

output "credentials_secret_id" {
  description = "Secret Manager secret ID holding DB credentials + connection info."
  value       = google_secret_manager_secret.db.secret_id
}
