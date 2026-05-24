variable "project_id" {
  description = "GCP project ID for the Cloud Armor security policy."
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

variable "rate_limit_count" {
  description = "Allowed requests per interval per client IP before throttling."
  type        = number
  default     = 100
}

variable "rate_limit_interval_sec" {
  description = "Rate-limit interval in seconds (100 req / 60s = 100/min)."
  type        = number
  default     = 60
}

variable "waf_sensitivity" {
  description = "Preconfigured WAF rule sensitivity (1-4). Higher = stricter / more false positives."
  type        = number
  default     = 1
}
