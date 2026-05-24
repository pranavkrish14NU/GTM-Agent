variable "project_id" {
  description = "GCP project ID for the Cloud Tasks queues."
  type        = string
}

variable "region" {
  description = "GCP region (location) for the queues."
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

variable "max_attempts" {
  description = "Maximum delivery attempts before a task is considered failed."
  type        = number
  default     = 5
}

variable "min_backoff_seconds" {
  description = "Minimum retry backoff (seconds)."
  type        = number
  default     = 10
}

variable "max_backoff_seconds" {
  description = "Maximum retry backoff (seconds)."
  type        = number
  default     = 300
}

variable "max_doublings" {
  description = "Number of times the retry backoff doubles before becoming constant."
  type        = number
  default     = 4
}

variable "enqueuer_members" {
  description = "IAM members (serviceAccount:...) granted roles/cloudtasks.enqueuer on every queue. Typically the api-gateway and worker-pods service accounts (workload identity)."
  type        = list(string)
  default     = []
}
