# IAP TCP tunnel resources for the GitHub Actions deploy workflow.
# Keeps deploy identity separate from direct VM access (separation of duties).
# GitHub Actions impersonates stima-github-deploy-sa via WIF pool/provider.
#
# Auth model: gcloud uses ephemeral key injection (metadata-based SSH) to connect as the
# existing `odys` VM user via the IAP tunnel. OS Login is intentionally NOT used because
# the deploy script calls `docker` directly, and an OS Login SA user would not have docker
# group membership. The `odys` user already does.

resource "google_project_service" "iap" {
  project            = var.project_id
  service            = "iap.googleapis.com"
  disable_on_destroy = false
}

resource "google_service_account" "github_deploy" {
  account_id   = "stima-github-deploy-sa"
  display_name = "Stima GitHub Deploy Service Account"
  description  = "Impersonated by GitHub Actions deploy workflow via WIF; tunnels to VM through IAP using ephemeral key injection."
}

# Allow deploy SA to open IAP TCP tunnels to VM instances in this project.
resource "google_project_iam_member" "github_deploy_iap_tunnel" {
  project = var.project_id
  role    = "roles/iap.tunnelResourceAccessor"
  member  = "serviceAccount:${google_service_account.github_deploy.email}"
}

# Allow deploy SA to inject a temporary SSH key into VM instance metadata.
# Project-scoped: instance-scoped compute.instanceAdmin.v1 does not satisfy the
# setMetadata permission check that gcloud compute ssh performs.
resource "google_project_iam_member" "github_deploy_instance_admin" {
  project = var.project_id
  role    = "roles/compute.instanceAdmin.v1"
  member  = "serviceAccount:${google_service_account.github_deploy.email}"
}

# gcloud compute ssh calls projects.get before key injection — needs project-level read.
resource "google_project_iam_member" "github_deploy_compute_viewer" {
  project = var.project_id
  role    = "roles/compute.viewer"
  member  = "serviceAccount:${google_service_account.github_deploy.email}"
}

# GCP requires iam.serviceAccountUser on the VM's attached SA when modifying instance
# metadata on a VM that has a service account (privilege-escalation guard).
resource "google_service_account_iam_member" "github_deploy_backend_vm_sa_user" {
  service_account_id = google_service_account.backend_vm.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_deploy.email}"
}

# Allow the GitHub Actions OIDC principal set to impersonate the deploy SA.
resource "google_service_account_iam_member" "github_deploy_wif_user" {
  service_account_id = google_service_account.github_deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = local.github_actions_principal_set
}
