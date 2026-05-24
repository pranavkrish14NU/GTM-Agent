variable "project_id" {
  description = "GCP project ID for the WIF pool."
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, production) — used to suffix resource IDs."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository in 'owner/repo' format that is allowed to use this WIF pool (e.g. 'pranavkrish14NU/GTM-Agent')."
  type        = string
}

variable "ci_cd_deployer_sa_id" {
  description = "Fully-qualified service account ID for the ci-cd-deployer SA (from modules/iam outputs)."
  type        = string
}
