variable "project_id" {
  description = "GCP project ID for the Artifact Registry repository."
  type        = string
}

variable "region" {
  description = "Artifact Registry location (region)."
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

variable "repository_id" {
  description = "Base name for the Docker repository."
  type        = string
  default     = "boba-containers"
}

variable "writer_members" {
  description = "IAM members (serviceAccount:...) granted artifactregistry.writer (typically the ci-cd-deployer SA)."
  type        = list(string)
  default     = []
}

variable "keep_tagged_revisions" {
  description = "Number of most-recent tagged image revisions to retain."
  type        = number
  default     = 10
}

variable "untagged_ttl" {
  description = "Delete untagged images older than this duration (e.g. 2592000s = 30 days)."
  type        = string
  default     = "2592000s"
}
