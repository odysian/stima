output "vm_name" {
  description = "Backend VM instance name."
  value       = google_compute_instance.backend.name
}

output "vm_static_ip" {
  description = "Backend VM external static IP."
  value       = google_compute_address.backend.address
}

output "vm_service_account_email" {
  description = "Service account used by backend VM."
  value       = google_service_account.backend_vm.email
}

output "wif_provider_name" {
  description = "Full Workload Identity Provider resource name for GitHub Actions auth. Set as GCP_WIF_PROVIDER repository variable."
  value       = google_iam_workload_identity_pool_provider.github_actions.name
}

output "github_deploy_service_account_email" {
  description = "Service account email for the GitHub Actions deploy workflow. Set as GCP_DEPLOY_SA_EMAIL repository variable."
  value       = google_service_account.github_deploy.email
}
