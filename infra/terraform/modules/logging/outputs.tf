output "audit_bucket_name" {
  description = "Name of the GCS bucket receiving audit logs."
  value       = google_storage_bucket.audit_logs.name
}

output "audit_sink_name" {
  description = "Name of the Cloud Logging sink."
  value       = google_logging_project_sink.audit_sink.name
}

output "audit_sink_writer_identity" {
  description = "Service account identity used by the log sink to write to GCS."
  value       = google_logging_project_sink.audit_sink.writer_identity
}

output "error_rate_metric_name" {
  description = "Full name of the log-based error-rate metric."
  value       = google_logging_metric.error_rate.name
}
