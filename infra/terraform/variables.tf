variable "project_id" {
  description = "Target GCP project ID for this environment."
  type        = string
}

variable "region" {
  description = "Primary GCP region for regional resources."
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (dev, staging, production). Should match the selected Terraform workspace."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "environment must be one of: dev, staging, production."
  }
}

variable "network_name" {
  description = "Base name for the VPC and derived networking resources."
  type        = string
  default     = "boba-vpc"
}

variable "app_subnet_cidr" {
  description = "Primary CIDR for the application-tier subnet."
  type        = string
}

variable "data_subnet_cidr" {
  description = "Primary CIDR for the data-tier subnet."
  type        = string
}

variable "pods_secondary_cidr" {
  description = "Secondary CIDR for GKE pods on the app subnet."
  type        = string
}

variable "services_secondary_cidr" {
  description = "Secondary CIDR for GKE services on the app subnet."
  type        = string
}

variable "enable_iap_ssh" {
  description = "Allow IAP-tunnelled SSH to app-tier instances."
  type        = bool
  default     = true
}

# --- GKE (WO-002) ---
variable "gke_master_ipv4_cidr" {
  description = "RFC1918 /28 for the private GKE control plane. Must not overlap subnets or secondary ranges."
  type        = string
}

variable "gke_enable_private_endpoint" {
  description = "When true the GKE control plane has no public endpoint."
  type        = bool
  default     = true
}

variable "gke_master_authorized_networks" {
  description = "CIDR blocks allowed to reach the GKE control plane — CI/CD runner ranges only."
  type = list(object({
    cidr_block   = string
    display_name = string
  }))
  default = []
}

variable "gke_deletion_protection" {
  description = "Prevent accidental GKE cluster deletion (keep true in production)."
  type        = bool
  default     = true
}

# --- Cloud SQL (WO-003) ---
variable "cloud_sql_tier" {
  description = "Machine tier for the Cloud SQL primary and read replica."
  type        = string
  default     = "db-custom-2-7680"
}

variable "cloud_sql_deletion_protection" {
  description = "Prevent accidental Cloud SQL deletion (keep true in production)."
  type        = bool
  default     = true
}

# --- Redis (WO-004) ---
variable "redis_memory_size_gb" {
  description = "Memorystore Redis memory size in GB (dev 1, staging 2, production 4)."
  type        = number
  default     = 4
}

# --- Monitoring / Observability (WO-012) ---
variable "monitoring_notification_email" {
  description = "Email address for Cloud Monitoring alert notifications."
  type        = string
}

variable "monitoring_slack_channel_name" {
  description = "Slack channel for Cloud Monitoring alerts (e.g. '#ops-alerts'). Leave empty to disable."
  type        = string
  default     = ""
}

variable "monitoring_slack_auth_token" {
  description = "Slack OAuth token for the monitoring notification channel. Sensitive."
  type        = string
  default     = ""
  sensitive   = true
}
