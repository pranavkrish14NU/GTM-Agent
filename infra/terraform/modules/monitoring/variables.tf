variable "project_id" {
  description = "GCP project ID for the monitoring resources."
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

variable "region" {
  description = "Primary GCP region (informational; most monitoring resources are global)."
  type        = string
  default     = "us-central1"
}

# ---------------------------------------------------------------------------
# Notification channels
# ---------------------------------------------------------------------------
variable "notification_email" {
  description = "Email address that receives alert notifications."
  type        = string
}

variable "slack_channel_name" {
  description = "Slack channel name for alert notifications (e.g. '#ops-alerts'). Set to empty string to disable Slack notifications."
  type        = string
  default     = ""
}

variable "slack_auth_token" {
  description = "Slack OAuth token for the notification channel. Required when slack_channel_name is non-empty."
  type        = string
  default     = ""
  sensitive   = true
}

# ---------------------------------------------------------------------------
# Burn-rate alert windows
# Default to Google SRE book recommendations:
#   fast burn  → 1 h  (alert when 2% of monthly budget burns in 1 h)
#   slow burn  → 6 h  (alert when 5% of monthly budget burns in 6 h)
# ---------------------------------------------------------------------------
variable "fast_burn_lookback_seconds" {
  description = "Lookback window in seconds for the fast-burn rate alert (default 3600 = 1 h)."
  type        = number
  default     = 3600

  validation {
    condition     = var.fast_burn_lookback_seconds > 0 && var.fast_burn_lookback_seconds <= 86400
    error_message = "fast_burn_lookback_seconds must be between 1 s and 86400 s (24 h)."
  }
}

variable "slow_burn_lookback_seconds" {
  description = "Lookback window in seconds for the slow-burn rate alert (default 21600 = 6 h)."
  type        = number
  default     = 21600

  validation {
    condition     = var.slow_burn_lookback_seconds > 0 && var.slow_burn_lookback_seconds <= 86400
    error_message = "slow_burn_lookback_seconds must be between 1 s and 86400 s (24 h)."
  }
}
