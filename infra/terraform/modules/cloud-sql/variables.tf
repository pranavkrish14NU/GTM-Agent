variable "project_id" {
  description = "GCP project ID for the Cloud SQL instance."
  type        = string
}

variable "region" {
  description = "GCP region (primary instance and read replica live here)."
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, production)."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "environment must be one of: dev, staging, production."
  }
}

variable "network" {
  description = "VPC network self link for private IP (networking module network_self_link). Requires the Private Service Access connection from WO-001."
  type        = string
}

variable "database_version" {
  description = "Cloud SQL PostgreSQL version (15 or newer; pgvector is available on PG15+)."
  type        = string
  default     = "POSTGRES_15"

  validation {
    condition     = can(regex("^POSTGRES_(1[5-9]|[2-9][0-9])$", var.database_version))
    error_message = "database_version must be POSTGRES_15 or newer."
  }
}

variable "tier" {
  description = "Machine tier for the primary instance."
  type        = string
  default     = "db-custom-2-7680"
}

variable "replica_tier" {
  description = "Machine tier for the read replica."
  type        = string
  default     = "db-custom-2-7680"
}

variable "disk_size_gb" {
  description = "Initial data disk size (GB). Autoresize is enabled."
  type        = number
  default     = 50
}

variable "availability_type" {
  description = "REGIONAL for HA (failover replica) or ZONAL."
  type        = string
  default     = "REGIONAL"

  validation {
    condition     = contains(["REGIONAL", "ZONAL"], var.availability_type)
    error_message = "availability_type must be REGIONAL or ZONAL."
  }
}

variable "database_name" {
  description = "Application database name."
  type        = string
  default     = "boba"
}

variable "db_user" {
  description = "Application database user."
  type        = string
  default     = "boba_app"
}

variable "max_connections" {
  description = "Postgres max_connections flag. PgBouncer (deployed as a GKE sidecar in the app layer) pools client connections beneath this ceiling."
  type        = number
  default     = 100
}

variable "backup_retention_days" {
  description = "Number of automated daily backups to retain."
  type        = number
  default     = 7
}

variable "backup_start_time" {
  description = "Daily backup start time (UTC, HH:MM)."
  type        = string
  default     = "03:00"
}

variable "deletion_protection" {
  description = "Prevent accidental instance deletion (keep true in production)."
  type        = bool
  default     = true
}

variable "secret_accessor_members" {
  description = "IAM members (serviceAccount:...) granted read access to the DB credentials secret. Typically the api-gateway and worker-pods service accounts."
  type        = list(string)
  default     = []
}
