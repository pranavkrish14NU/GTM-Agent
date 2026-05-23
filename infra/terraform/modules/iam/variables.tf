variable "project_id" {
  description = "GCP project ID where the service accounts and bindings are created."
  type        = string
}

variable "environment" {
  description = "Environment name; suffixes service account IDs to keep them unique per environment."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "environment must be one of: dev, staging, production."
  }
}

# Each service account maps to one service boundary in the architecture. Roles
# default to the minimum each boundary needs; callers can override per env.
variable "api_gateway_roles" {
  description = "Least-privilege roles for the API gateway service account."
  type        = list(string)
  default = [
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/cloudtrace.agent",
    "roles/secretmanager.secretAccessor",
    "roles/cloudsql.client",
    "roles/cloudtasks.enqueuer",
  ]
}

variable "worker_pods_roles" {
  description = "Least-privilege roles for the worker pods service account."
  type        = list(string)
  default = [
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/cloudtrace.agent",
    "roles/secretmanager.secretAccessor",
    "roles/cloudsql.client",
    "roles/cloudtasks.taskRunner",
  ]
}

variable "ci_cd_deployer_roles" {
  description = "Least-privilege roles for the CI/CD deployer service account."
  type        = list(string)
  default = [
    "roles/container.developer",
    "roles/artifactregistry.writer",
    "roles/iam.serviceAccountUser",
    "roles/logging.logWriter",
  ]
}
