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
