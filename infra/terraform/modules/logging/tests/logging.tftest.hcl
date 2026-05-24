mock_provider "google" {}

variables {
  project_id  = "boba-test"
  environment = "dev"
  region      = "us-central1"
}

run "audit_bucket_created" {
  command = plan

  assert {
    condition     = google_storage_bucket.audit_logs.name == "boba-audit-logs-dev-boba-test"
    error_message = "Bucket must be named boba-audit-logs-<env>-<project>."
  }

  assert {
    condition     = google_storage_bucket.audit_logs.uniform_bucket_level_access == true
    error_message = "Bucket must use uniform bucket-level access."
  }
}

run "retention_90_days" {
  command = plan

  assert {
    # 90 days × 86400 s = 7,776,000 s
    condition     = google_storage_bucket.audit_logs.retention_policy[0].retention_period == 7776000
    error_message = "Retention period must be 90 days (7,776,000 seconds) for SOC 2 compliance."
  }
}

run "log_sink_routes_warnings" {
  command = plan

  assert {
    condition     = google_logging_project_sink.audit_sink.unique_writer_identity == true
    error_message = "Sink must use a unique writer identity."
  }

  assert {
    condition     = strcontains(google_logging_project_sink.audit_sink.destination, google_storage_bucket.audit_logs.name)
    error_message = "Sink destination must reference the audit bucket."
  }
}

run "error_rate_metric_defined" {
  command = plan

  assert {
    condition     = google_logging_metric.error_rate.metric_descriptor[0].metric_kind == "DELTA"
    error_message = "Error rate metric must be DELTA (counts per interval)."
  }

  assert {
    condition     = strcontains(google_logging_metric.error_rate.filter, "error")
    error_message = "Error rate metric filter must match error-level logs."
  }
}

run "rejects_retention_below_90_days" {
  command = plan

  variables {
    audit_log_retention_days = 30
  }

  expect_failures = [
    var.audit_log_retention_days,
  ]
}

run "rejects_invalid_environment" {
  command = plan

  variables {
    environment = "qa"
  }

  expect_failures = [
    var.environment,
  ]
}
