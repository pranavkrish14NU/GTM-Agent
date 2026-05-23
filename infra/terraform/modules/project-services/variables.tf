variable "project_id" {
  description = "GCP project ID on which to enable APIs."
  type        = string
}

variable "activate_apis" {
  description = "APIs required by the BOBA platform across all infrastructure work orders."
  type        = list(string)
  default = [
    "compute.googleapis.com",
    "servicenetworking.googleapis.com",
    "container.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "cloudtasks.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudkms.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "artifactregistry.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "cloudtrace.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "storage.googleapis.com",
  ]
}

variable "disable_services_on_destroy" {
  description = "Whether to disable the APIs when the resource is destroyed. Left false so tearing down one environment never disrupts a shared project."
  type        = bool
  default     = false
}
