variable "project_id" {
  description = "GCP project ID that owns the Terraform state bucket."
  type        = string
}

variable "bucket_name" {
  description = "Globally-unique name for the Terraform state bucket."
  type        = string
}

variable "location" {
  description = "Bucket location (region or multi-region)."
  type        = string
  default     = "US"
}

variable "noncurrent_versions_to_keep" {
  description = "How many noncurrent (historical) state versions to retain before lifecycle deletion."
  type        = number
  default     = 10
}

variable "labels" {
  description = "Labels applied to the state bucket."
  type        = map(string)
  default     = {}
}
