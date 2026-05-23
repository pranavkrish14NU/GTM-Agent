variable "project_id" {
  description = "GCP project ID that will own the Terraform state bucket."
  type        = string
}

variable "region" {
  description = "Default region for the google provider."
  type        = string
  default     = "us-central1"
}

variable "state_bucket_name" {
  description = "Globally-unique name for the Terraform state bucket."
  type        = string
}

variable "state_bucket_location" {
  description = "Location (region or multi-region) for the state bucket."
  type        = string
  default     = "US"
}
