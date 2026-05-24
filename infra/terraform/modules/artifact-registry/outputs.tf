output "repository_id" {
  description = "Artifact Registry repository ID."
  value       = google_artifact_registry_repository.containers.repository_id
}

output "repository_name" {
  description = "Fully-qualified repository resource name."
  value       = google_artifact_registry_repository.containers.name
}

output "registry_url" {
  description = "Docker registry URL prefix for pushing/pulling images."
  value       = "${google_artifact_registry_repository.containers.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}"
}
