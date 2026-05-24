variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, production)."
  type        = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "environment must be one of: dev, staging, production."
  }
}

variable "region" {
  description = "GCP region for the audit-log storage bucket."
  type        = string
  default     = "us-central1"
}

variable "audit_log_retention_days" {
  description = "Days to retain audit logs. SOC 2 requires >= 90."
  type        = number
  default     = 90
  validation {
    condition     = var.audit_log_retention_days >= 90
    error_message = "audit_log_retention_days must be >= 90 (SOC 2 compliance requirement)."
  }
}

variable "log_sink_filter" {
  description = "Log filter for the Cloud Logging sink. Captures WARNING and above by default."
  type        = string
  default     = "severity >= WARNING"
}
