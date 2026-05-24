variable "project_id" {
  description = "GCP project ID for KMS and Secret Manager resources."
  type        = string
}

variable "region" {
  description = "GCP region (KMS keyring location)."
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

variable "api_gateway_sa_email" {
  description = "API gateway service account email (consumes most secrets/keys)."
  type        = string
}

variable "worker_pods_sa_email" {
  description = "Worker pods service account email (consumes data/LLM secrets/keys)."
  type        = string
}

variable "key_rotation_period_seconds" {
  description = "KMS automatic rotation period in seconds (default 90 days)."
  type        = number
  default     = 7776000
}
