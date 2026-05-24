output "host" {
  description = "Redis instance private IP."
  value       = google_redis_instance.this.host
}

output "port" {
  description = "Redis instance port."
  value       = google_redis_instance.this.port
}

output "instance_id" {
  description = "Fully-qualified Redis instance ID."
  value       = google_redis_instance.this.id
}

output "current_location_id" {
  description = "Zone of the current Redis primary."
  value       = google_redis_instance.this.current_location_id
}

output "credentials_secret_id" {
  description = "Secret Manager secret ID holding Redis host/port/AUTH."
  value       = google_secret_manager_secret.redis.secret_id
}
