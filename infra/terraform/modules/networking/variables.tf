variable "project_id" {
  description = "GCP project ID where networking resources are created."
  type        = string
}

variable "region" {
  description = "GCP region for regional resources (subnets, router, NAT)."
  type        = string
}

variable "environment" {
  description = "Environment name. Drives resource naming and must match a configured workspace."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "environment must be one of: dev, staging, production."
  }
}

variable "network_name" {
  description = "Base name for the VPC network and derived resources."
  type        = string
  default     = "boba-vpc"
}

variable "app_subnet_cidr" {
  description = "Primary CIDR for the application-tier private subnet (GKE nodes, API gateway)."
  type        = string
  default     = "10.10.0.0/20"
}

variable "data_subnet_cidr" {
  description = "Primary CIDR for the data-tier private subnet (managed data services, internal endpoints)."
  type        = string
  default     = "10.20.0.0/20"
}

variable "pods_secondary_cidr" {
  description = "Secondary CIDR on the app subnet for GKE pods. Consumed by the GKE module (WO-002)."
  type        = string
  default     = "10.32.0.0/14"
}

variable "services_secondary_cidr" {
  description = "Secondary CIDR on the app subnet for GKE services. Consumed by the GKE module (WO-002)."
  type        = string
  default     = "10.36.0.0/20"
}

variable "psa_prefix_length" {
  description = "Prefix length for the Private Service Access reserved range used by Cloud SQL (WO-003) and Redis (WO-004)."
  type        = number
  default     = 16
}

variable "lb_source_ranges" {
  description = "Source ranges permitted to reach app-tier backends on 443. Defaults to the Google Front End / health-check ranges that front external HTTPS load balancers."
  type        = list(string)
  default     = ["130.211.0.0/22", "35.191.0.0/16"]
}

variable "app_target_tags" {
  description = "Network tags applied to app-tier instances that LB and IAP firewall rules target."
  type        = list(string)
  default     = ["boba-app"]
}

variable "app_ingress_ports" {
  description = "TCP ports the load balancer / health checks may reach on app-tier backends."
  type        = list(string)
  default     = ["443", "8080"]
}

variable "enable_iap_ssh" {
  description = "When true, allow SSH from Google's IAP TCP forwarding range to app-tier instances (admin access without public IPs)."
  type        = bool
  default     = true
}

variable "flow_logs_sampling" {
  description = "VPC flow log sampling rate for subnets (0.0-1.0)."
  type        = number
  default     = 0.5
}
