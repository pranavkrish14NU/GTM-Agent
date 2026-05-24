output "security_policy_id" {
  description = "Cloud Armor security policy ID (attach to backend services / GKE Ingress)."
  value       = google_compute_security_policy.waf.id
}

output "security_policy_name" {
  description = "Cloud Armor security policy name."
  value       = google_compute_security_policy.waf.name
}
