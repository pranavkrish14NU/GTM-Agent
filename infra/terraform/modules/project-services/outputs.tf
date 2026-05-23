output "enabled_apis" {
  description = "The set of APIs enabled on the project."
  value       = [for s in google_project_service.apis : s.service]
}
