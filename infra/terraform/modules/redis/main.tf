# Managed Memorystore Redis: HA (failover replica), private connectivity over
# the VPC's Private Service Access peering, AUTH + in-transit TLS enabled.
resource "google_redis_instance" "this" {
  name           = "boba-redis-${var.environment}"
  project        = var.project_id
  region         = var.region
  tier           = var.tier
  memory_size_gb = var.memory_size_gb
  redis_version  = var.redis_version

  # Reachable only from the VPC via Private Service Access (no public endpoint).
  connect_mode            = "PRIVATE_SERVICE_ACCESS"
  authorized_network      = var.network
  auth_enabled            = true
  transit_encryption_mode = "SERVER_AUTHENTICATION"

  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 4
        minutes = 0
        seconds = 0
        nanos   = 0
      }
    }
  }

  labels = {
    environment = var.environment
    managed-by  = "terraform"
    component   = "redis"
  }
}

# Publish connection details + AUTH string for runtime consumers (apps read
# this from Secret Manager rather than from config).
resource "google_secret_manager_secret" "redis" {
  project   = var.project_id
  secret_id = "boba-redis-credentials-${var.environment}"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "redis" {
  secret = google_secret_manager_secret.redis.id

  secret_data = jsonencode({
    host        = google_redis_instance.this.host
    port        = google_redis_instance.this.port
    auth_string = google_redis_instance.this.auth_string
    tls_enabled = true
  })
}

resource "google_secret_manager_secret_iam_member" "accessors" {
  for_each = toset(var.secret_accessor_members)

  project   = var.project_id
  secret_id = google_secret_manager_secret.redis.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = each.value
}
