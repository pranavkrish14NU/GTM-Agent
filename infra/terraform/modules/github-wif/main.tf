/**
 * GitHub Actions Workload Identity Federation (WIF).
 *
 * Creates a WIF pool + OIDC provider that allows GitHub Actions workflows in
 * the configured repository to authenticate as the ci-cd-deployer service
 * account without storing any static credentials.
 *
 * Usage in GitHub Actions:
 *   - uses: google-github-actions/auth@v2
 *     with:
 *       workload_identity_provider: <pool_provider_name output>
 *       service_account: <ci_cd_sa_email>
 *
 * References:
 *   https://cloud.google.com/iam/docs/workload-identity-federation-with-other-providers
 */

# Workload Identity Pool — one per project.
resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "boba-github-${var.environment}"
  display_name              = "GitHub Actions (${var.environment})"
  description               = "WIF pool for GitHub Actions CI/CD workflows."
  disabled                  = false
}

# OIDC provider — maps GitHub OIDC tokens to GCP identities.
resource "google_iam_workload_identity_pool_provider" "github_oidc" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"
  description                        = "OIDC provider for GitHub Actions tokens."

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  # Attribute mapping — maps claims from the GitHub OIDC token to Google
  # attributes.  The `repository` claim is used in the binding below.
  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
    "attribute.ref"              = "assertion.ref"
    "attribute.event_name"       = "assertion.event_name"
  }

  # Restrict to the configured GitHub repository for defence-in-depth.
  attribute_condition = "assertion.repository == \"${var.github_repository}\""
}

# Bind the ci-cd-deployer SA → WIF pool so GitHub Actions can impersonate it.
resource "google_service_account_iam_member" "wif_binding" {
  service_account_id = var.ci_cd_deployer_sa_id
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}
