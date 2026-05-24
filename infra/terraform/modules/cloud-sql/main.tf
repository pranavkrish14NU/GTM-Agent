locals {
  instance_name = "boba-pg-${var.environment}-${random_id.suffix.hex}"
}

# Cloud SQL instance names cannot be reused for ~1 week after deletion; a random
# suffix avoids name collisions on recreate.
resource "random_id" "suffix" {
  byte_length = 2
}

# Generated application DB password. It lands in Terraform state, which is why
# the state backend (WO-001) is a private, uniform-access, versioned GCS bucket;
# the password is also published to Secret Manager for runtime consumers.
resource "random_password" "db" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}"
}

# Primary PostgreSQL instance: private IP only, HA, SSL-enforced, with pgvector
# available (PG15+). pgvector is enabled per-database at runtime via
# `CREATE EXTENSION vector;` (a migration step — see module README).
resource "google_sql_database_instance" "primary" {
  name                = local.instance_name
  project             = var.project_id
  region              = var.region
  database_version    = var.database_version
  deletion_protection = var.deletion_protection

  settings {
    tier              = var.tier
    availability_type = var.availability_type
    disk_type         = "PD_SSD"
    disk_size         = var.disk_size_gb
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      start_time                     = var.backup_start_time
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = var.backup_retention_days
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      # No public IP — reachable only over the VPC's Private Service Access peering.
      ipv4_enabled    = false
      private_network = var.network
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    database_flags {
      name  = "max_connections"
      value = tostring(var.max_connections)
    }

    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }

    # Audit logging flags (recommended PostgreSQL hardening).
    database_flags {
      name  = "log_checkpoints"
      value = "on"
    }
    database_flags {
      name  = "log_connections"
      value = "on"
    }
    database_flags {
      name  = "log_disconnections"
      value = "on"
    }
    database_flags {
      name  = "log_lock_waits"
      value = "on"
    }

    maintenance_window {
      day          = 7
      hour         = 4
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled = true
    }
  }
}

resource "google_sql_database" "app" {
  name     = var.database_name
  project  = var.project_id
  instance = google_sql_database_instance.primary.name
}

resource "google_sql_user" "app" {
  name     = var.db_user
  project  = var.project_id
  instance = google_sql_database_instance.primary.name
  password = random_password.db.result
}

# Read replica in the same region for distributing vector-search reads.
resource "google_sql_database_instance" "replica" {
  name                 = "${local.instance_name}-replica"
  project              = var.project_id
  region               = var.region
  database_version     = var.database_version
  master_instance_name = google_sql_database_instance.primary.name
  deletion_protection  = var.deletion_protection

  replica_configuration {
    failover_target = false
  }

  settings {
    tier              = var.replica_tier
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.network
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    insights_config {
      query_insights_enabled = true
    }
  }
}

# Credentials + connection details for runtime consumers (never committed to
# code; read via Secret Manager by the api-gateway/worker service accounts).
resource "google_secret_manager_secret" "db" {
  project   = var.project_id
  secret_id = "boba-db-credentials-${var.environment}"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db" {
  secret = google_secret_manager_secret.db.id

  secret_data = jsonencode({
    username        = google_sql_user.app.name
    password        = random_password.db.result
    database        = google_sql_database.app.name
    host            = google_sql_database_instance.primary.private_ip_address
    replica_host    = google_sql_database_instance.replica.private_ip_address
    port            = 5432
    connection_name = google_sql_database_instance.primary.connection_name
    sslmode         = "verify-ca"
  })
}

resource "google_secret_manager_secret_iam_member" "accessors" {
  for_each = toset(var.secret_accessor_members)

  project   = var.project_id
  secret_id = google_secret_manager_secret.db.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = each.value
}
