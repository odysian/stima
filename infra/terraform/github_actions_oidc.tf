locals {
  github_actions_principal_set = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_actions.name}/attribute.repository/${var.github_repository}"
}

resource "google_iam_workload_identity_pool" "github_actions" {
  workload_identity_pool_id = var.github_oidc_pool_id
  display_name              = "Stima GitHub Actions Pool"
  description               = "OIDC trust pool for GitHub Actions workflows."
}

resource "google_iam_workload_identity_pool_provider" "github_actions" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_actions.workload_identity_pool_id
  workload_identity_pool_provider_id = var.github_oidc_provider_id
  display_name                       = "Stima GitHub Actions Provider"
  description                        = "OIDC provider for token.actions.githubusercontent.com."

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  attribute_condition = "assertion.repository == \"${var.github_repository}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}
