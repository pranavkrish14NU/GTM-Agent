variable "project_id" {
  description = "GCP project ID for the Memorystore instance."
  type        = string
}

variable "region" {
  description = "GCP region for the Redis instance."
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
  description = "VPC network self link (networking module network_self_link). Redis connects via Private Service Access (WO-001)."
  type        = string
}

variable "memory_size_gb" {
  description = "Redis memory size in GB. Environment-specific (dev 1, staging 2, production 4)."
  type        = number
  default     = 4

  validation {
    condition     = var.memory_size_gb >= 1
    error_message = "memory_size_gb must be at least 1 (Standard tier minimum)."
  }
}

variable "redis_version" {
  description = "Redis version (7.0+)."
  type        = string
  default     = "REDIS_7_0"
}

variable "tier" {
  description = "Service tier. STANDARD_HA provides a failover replica."
  type        = string
  default     = "STANDARD_HA"

  validation {
    condition     = contains(["BASIC", "STANDARD_HA"], var.tier)
    error_message = "tier must be BASIC or STANDARD_HA."
  }
}

variable "secret_accessor_members" {
  description = "IAM members (serviceAccount:...) granted read access to the Redis AUTH secret."
  type        = list(string)
  default     = []
}
