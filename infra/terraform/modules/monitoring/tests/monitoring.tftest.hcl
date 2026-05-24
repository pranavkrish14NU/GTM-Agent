mock_provider "google" {}

variables {
  project_id         = "boba-test"
  environment        = "dev"
  region             = "us-central1"
  notification_email = "ops@boba-test.example.com"
}

# ---------------------------------------------------------------------------
# Email notification channel is always created.
# ---------------------------------------------------------------------------
run "email_notification_channel_created" {
  command = plan

  assert {
    condition     = google_monitoring_notification_channel.email.type == "email"
    error_message = "Notification channel must be of type 'email'."
  }

  assert {
    condition     = google_monitoring_notification_channel.email.labels["email_address"] == "ops@boba-test.example.com"
    error_message = "Email channel must use the configured email address."
  }
}

# ---------------------------------------------------------------------------
# Slack channel is not created when slack_channel_name is empty (default).
# ---------------------------------------------------------------------------
run "slack_channel_not_created_by_default" {
  command = plan

  assert {
    condition     = length(google_monitoring_notification_channel.slack) == 0
    error_message = "Slack notification channel must NOT be created when slack_channel_name is empty."
  }
}

# ---------------------------------------------------------------------------
# Slack channel IS created when a channel name is provided.
# ---------------------------------------------------------------------------
run "slack_channel_created_when_configured" {
  command = plan

  variables {
    slack_channel_name = "#ops-alerts"
    slack_auth_token   = "xoxb-test-token"
  }

  assert {
    condition     = length(google_monitoring_notification_channel.slack) == 1
    error_message = "Slack notification channel must be created when slack_channel_name is non-empty."
  }

  assert {
    condition     = google_monitoring_notification_channel.slack[0].labels["channel_name"] == "#ops-alerts"
    error_message = "Slack channel name must match the configured value."
  }
}

# ---------------------------------------------------------------------------
# SLO goals are all 99.9%.
# ---------------------------------------------------------------------------
run "slo_goals_are_99_9_percent" {
  command = plan

  assert {
    condition     = google_monitoring_slo.api_availability.goal == 0.999
    error_message = "API Availability SLO goal must be 0.999 (99.9%)."
  }

  assert {
    condition     = google_monitoring_slo.api_latency.goal == 0.999
    error_message = "API Latency SLO goal must be 0.999."
  }

  assert {
    condition     = google_monitoring_slo.search_latency.goal == 0.999
    error_message = "Search Latency SLO goal must be 0.999."
  }
}

# ---------------------------------------------------------------------------
# SLO rolling periods are all 30 days.
# ---------------------------------------------------------------------------
run "slo_rolling_periods_are_30_days" {
  command = plan

  assert {
    condition     = google_monitoring_slo.api_availability.rolling_period_days == 30
    error_message = "API Availability SLO rolling period must be 30 days."
  }

  assert {
    condition     = google_monitoring_slo.search_latency.rolling_period_days == 30
    error_message = "Search Latency SLO rolling period must be 30 days."
  }
}

# ---------------------------------------------------------------------------
# API Latency SLO threshold is 500ms (max = 500).
# ---------------------------------------------------------------------------
run "api_latency_slo_threshold_500ms" {
  command = plan

  assert {
    condition     = google_monitoring_slo.api_latency.windows_based_sli[0].metric_mean_in_range[0].range[0].max == 500
    error_message = "API Latency SLO window threshold must be 500ms."
  }

  assert {
    condition     = google_monitoring_slo.api_latency.windows_based_sli[0].metric_mean_in_range[0].range[0].min == 0
    error_message = "API Latency SLO window range minimum must be 0."
  }
}

# ---------------------------------------------------------------------------
# Search Latency SLO threshold is 2000ms (2s max).
# ---------------------------------------------------------------------------
run "search_latency_slo_threshold_2s" {
  command = plan

  assert {
    condition     = google_monitoring_slo.search_latency.windows_based_sli[0].metric_mean_in_range[0].range[0].max == 2000
    error_message = "Search Latency SLO threshold must be 2000ms (2s)."
  }
}

# ---------------------------------------------------------------------------
# Alert policies use OR combiner (either fast or slow burn triggers the alert).
# ---------------------------------------------------------------------------
run "alert_policies_use_or_combiner" {
  command = plan

  assert {
    condition     = google_monitoring_alert_policy.api_availability_burn_rate.combiner == "OR"
    error_message = "API Availability burn-rate alert policy must use OR combiner."
  }

  assert {
    condition     = google_monitoring_alert_policy.api_latency_burn_rate.combiner == "OR"
    error_message = "API Latency burn-rate alert policy must use OR combiner."
  }

  assert {
    condition     = google_monitoring_alert_policy.search_latency_burn_rate.combiner == "OR"
    error_message = "Search Latency burn-rate alert policy must use OR combiner."
  }
}

# ---------------------------------------------------------------------------
# Each alert policy has exactly two conditions (fast burn + slow burn).
# ---------------------------------------------------------------------------
run "alert_policies_have_two_conditions" {
  command = plan

  assert {
    condition     = length(google_monitoring_alert_policy.api_availability_burn_rate.conditions) == 2
    error_message = "API Availability alert policy must have 2 conditions (fast + slow burn)."
  }

  assert {
    condition     = length(google_monitoring_alert_policy.api_latency_burn_rate.conditions) == 2
    error_message = "API Latency alert policy must have 2 conditions (fast + slow burn)."
  }

  assert {
    condition     = length(google_monitoring_alert_policy.search_latency_burn_rate.conditions) == 2
    error_message = "Search Latency alert policy must have 2 conditions (fast + slow burn)."
  }
}

# ---------------------------------------------------------------------------
# Fast-burn threshold resolves to 14.4× for default 1h window.
# slow-burn threshold resolves to 6.0× for default 6h window.
# ---------------------------------------------------------------------------
run "burn_rate_thresholds_are_correct" {
  command = plan

  assert {
    # 0.02 * (720 / (3600/3600)) = 0.02 * 720 = 14.4
    condition     = google_monitoring_alert_policy.api_availability_burn_rate.conditions[0].condition_threshold[0].threshold_value == 14.4
    error_message = "Fast burn threshold must be 14.4 for a 99.9% SLO with 1h window."
  }

  assert {
    # 0.05 * (720 / (21600/3600)) = 0.05 * 120 = 6.0
    condition     = google_monitoring_alert_policy.api_availability_burn_rate.conditions[1].condition_threshold[0].threshold_value == 6
    error_message = "Slow burn threshold must be 6 for a 99.9% SLO with 6h window."
  }
}

# ---------------------------------------------------------------------------
# Three dashboards are defined.
# ---------------------------------------------------------------------------
run "dashboards_are_defined" {
  command = plan

  assert {
    condition     = google_monitoring_dashboard.api_service.project == "boba-test"
    error_message = "API Service dashboard must be scoped to the configured project."
  }

  assert {
    condition     = google_monitoring_dashboard.worker_service.project == "boba-test"
    error_message = "Worker Service dashboard must be scoped to the configured project."
  }

  assert {
    condition     = google_monitoring_dashboard.database.project == "boba-test"
    error_message = "Database dashboard must be scoped to the configured project."
  }
}

# ---------------------------------------------------------------------------
# Rejects invalid environment names.
# ---------------------------------------------------------------------------
run "rejects_invalid_environment" {
  command = plan

  variables {
    environment = "qa"
  }

  expect_failures = [
    var.environment,
  ]
}

# ---------------------------------------------------------------------------
# Rejects fast_burn_lookback_seconds exceeding 24h.
# ---------------------------------------------------------------------------
run "rejects_fast_burn_window_over_24h" {
  command = plan

  variables {
    fast_burn_lookback_seconds = 90000
  }

  expect_failures = [
    var.fast_burn_lookback_seconds,
  ]
}
