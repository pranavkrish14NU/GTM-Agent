output "email_notification_channel_id" {
  description = "Resource ID of the email notification channel."
  value       = google_monitoring_notification_channel.email.id
}

output "slack_notification_channel_id" {
  description = "Resource ID of the Slack notification channel (empty string when Slack is not configured)."
  value       = length(google_monitoring_notification_channel.slack) > 0 ? google_monitoring_notification_channel.slack[0].id : ""
}

output "custom_service_id" {
  description = "ID of the custom Cloud Monitoring service used for SLO definitions."
  value       = google_monitoring_custom_service.api.service_id
}

output "api_availability_slo_id" {
  description = "Full resource name of the API Availability SLO."
  value       = google_monitoring_slo.api_availability.id
}

output "api_latency_slo_id" {
  description = "Full resource name of the API Latency p95 SLO."
  value       = google_monitoring_slo.api_latency.id
}

output "search_latency_slo_id" {
  description = "Full resource name of the Search Latency p95 SLO."
  value       = google_monitoring_slo.search_latency.id
}

output "api_availability_alert_policy_name" {
  description = "Display name of the API Availability SLO burn-rate alert policy."
  value       = google_monitoring_alert_policy.api_availability_burn_rate.display_name
}

output "api_latency_alert_policy_name" {
  description = "Display name of the API Latency SLO burn-rate alert policy."
  value       = google_monitoring_alert_policy.api_latency_burn_rate.display_name
}

output "search_latency_alert_policy_name" {
  description = "Display name of the Search Latency SLO burn-rate alert policy."
  value       = google_monitoring_alert_policy.search_latency_burn_rate.display_name
}

output "api_service_dashboard_name" {
  description = "Display name of the API Service monitoring dashboard."
  value       = "BOBA API Service (${google_monitoring_dashboard.api_service.project})"
}

output "worker_service_dashboard_name" {
  description = "Display name of the Worker Service monitoring dashboard."
  value       = "BOBA Worker Service (${google_monitoring_dashboard.worker_service.project})"
}

output "database_dashboard_name" {
  description = "Display name of the Database monitoring dashboard."
  value       = "BOBA Database (${google_monitoring_dashboard.database.project})"
}
