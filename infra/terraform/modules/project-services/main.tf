# Enable every API the platform's infrastructure work orders depend on.
# disable_dependent_services is false so enabling these never cascades into
# disabling something another team relies on.
resource "google_project_service" "apis" {
  for_each = toset(var.activate_apis)

  project = var.project_id
  service = each.value

  disable_dependent_services = false
  disable_on_destroy         = var.disable_services_on_destroy
}
