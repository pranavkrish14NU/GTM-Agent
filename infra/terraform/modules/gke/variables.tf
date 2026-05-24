variable "project_id" {
  description = "GCP project ID for the GKE cluster."
  type        = string
}

variable "region" {
  description = "GCP region. The cluster is regional (control plane + nodes spread across the region's zones) for HA."
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

variable "cluster_name" {
  description = "Base name for the GKE cluster."
  type        = string
  default     = "boba-gke"
}

# --- Networking (from WO-001 networking module) ---
variable "network" {
  description = "Self link or ID of the VPC network (networking module network_self_link)."
  type        = string
}

variable "subnetwork" {
  description = "Self link or ID of the app-tier subnet hosting the nodes (networking module app_subnet_self_link)."
  type        = string
}

variable "pods_range_name" {
  description = "Name of the subnet secondary range for pods (networking module pods_secondary_range_name)."
  type        = string
  default     = "gke-pods"
}

variable "services_range_name" {
  description = "Name of the subnet secondary range for services (networking module services_secondary_range_name)."
  type        = string
  default     = "gke-services"
}

variable "master_ipv4_cidr" {
  description = "RFC1918 /28 reserved for the private control plane. Must not overlap any subnet or secondary range."
  type        = string
  default     = "172.16.0.0/28"
}

variable "enable_private_endpoint" {
  description = "When true the control plane has no public endpoint (AC: 'no public endpoint'). CI/CD must reach it from within the VPC / authorized networks."
  type        = bool
  default     = true
}

variable "master_authorized_networks" {
  description = "CIDR blocks allowed to reach the control plane — CI/CD runner ranges only. Each: { cidr_block, display_name }."
  type = list(object({
    cidr_block   = string
    display_name = string
  }))
  default = []
}

variable "release_channel" {
  description = "GKE release channel (RAPID, REGULAR, STABLE)."
  type        = string
  default     = "REGULAR"

  validation {
    condition     = contains(["RAPID", "REGULAR", "STABLE"], var.release_channel)
    error_message = "release_channel must be one of: RAPID, REGULAR, STABLE."
  }
}

variable "node_service_account" {
  description = "Email of the IAM service account the nodes run as (WO-001 worker-pods SA). Least-privilege; pods get their own identity via Workload Identity."
  type        = string
}

# --- General-purpose node pool ---
variable "general_machine_type" {
  description = "Machine type for the general-purpose node pool."
  type        = string
  default     = "e2-standard-4"
}

variable "general_min_nodes" {
  description = "Total minimum nodes (across zones) for the general-purpose pool."
  type        = number
  default     = 2
}

variable "general_max_nodes" {
  description = "Total maximum nodes (across zones) for the general-purpose pool."
  type        = number
  default     = 10
}

# --- Worker node pool ---
variable "worker_machine_type" {
  description = "Machine type for the high-memory worker node pool."
  type        = string
  default     = "e2-highmem-4"
}

variable "worker_min_nodes" {
  description = "Total minimum nodes (across zones) for the worker pool."
  type        = number
  default     = 2
}

variable "worker_max_nodes" {
  description = "Total maximum nodes (across zones) for the worker pool."
  type        = number
  default     = 20
}

# --- Workload Identity binding ---
variable "workload_identity_namespace" {
  description = "Kubernetes namespace of the workload that assumes the GCP service account."
  type        = string
  default     = "boba"
}

variable "workload_identity_ksa" {
  description = "Kubernetes service account name mapped to the GCP service account via Workload Identity."
  type        = string
  default     = "boba-workload"
}

variable "deletion_protection" {
  description = "Prevent accidental cluster deletion. Keep true in production."
  type        = bool
  default     = true
}
