variable "project_id" {
  description = "GCP project ID."
  type        = string
}

variable "region" {
  description = "GCP region for regional resources."
  type        = string
}

variable "zone" {
  description = "GCP zone for zonal resources."
  type        = string
}

variable "network" {
  description = "VPC network name."
  type        = string
  default     = "default"
}

variable "subnetwork" {
  description = "Subnetwork self-link or name."
  type        = string
  default     = "default"
}

variable "vm_name" {
  description = "Backend VM instance name."
  type        = string
  default     = "stima-backend"
}

variable "machine_type" {
  description = "Compute machine type."
  type        = string
  default     = "e2-micro"
}

variable "vm_boot_disk_size_gb" {
  description = "Boot disk size in GB."
  type        = number
  default     = 10
}

variable "vm_image" {
  description = "Boot image for the VM. Defaults to latest Debian 12 family image."
  type        = string
  default     = "projects/debian-cloud/global/images/family/debian-12"
}

variable "vm_network_tag" {
  description = "Network tag applied to backend VM."
  type        = string
  default     = "stima-backend"
}

variable "static_ip_name" {
  description = "Reserved static external IP name."
  type        = string
  default     = "stima-backend-ip"
}

variable "ssh_user" {
  description = "Linux SSH username provisioned on the VM."
  type        = string
  default     = "odys"
}

variable "ssh_public_keys" {
  description = "List of authorized public keys for ssh_user."
  type        = list(string)
}

variable "ssh_source_ranges" {
  description = "Source CIDRs allowed for SSH ingress."
  type        = list(string)

  validation {
    condition     = length(var.ssh_source_ranges) > 0
    error_message = "ssh_source_ranges must contain at least one CIDR."
  }
}

variable "allow_insecure_ssh_from_anywhere" {
  description = "Temporary rollout exception to allow ssh_source_ranges to include 0.0.0.0/0."
  type        = bool
  default     = false
}

variable "api_domain" {
  description = "Public API domain for NGINX server_name and cert issuance."
  type        = string
  default     = "api.stima.odysian.dev"
}

variable "frontend_url" {
  description = "Frontend origin written into infra.env for deploy script."
  type        = string
  default     = "https://stima.odysian.dev"
}

variable "backend_port" {
  description = "Backend container port used by NGINX upstream."
  type        = number
  default     = 8000
}

variable "certbot_email" {
  description = "Email for ZeroSSL/certbot registration."
  type        = string
  default     = ""
}

variable "enable_tls_bootstrap" {
  description = "Whether startup bootstrap should attempt certbot certificate provisioning."
  type        = bool
  default     = false
}

variable "vm_service_account_scopes" {
  description = "Additional OAuth scopes for the VM service account. Required logging/monitoring scopes are always enforced additively."
  type        = list(string)
  default     = []
}

variable "enable_secure_boot" {
  description = "Whether to enable Shielded VM secure boot."
  type        = bool
  default     = true
}

variable "github_oidc_pool_id" {
  description = "Workload Identity Pool ID for GitHub Actions OIDC auth."
  type        = string
  default     = "stima-github-actions-pool"
}

variable "github_oidc_provider_id" {
  description = "Workload Identity Pool Provider ID for GitHub Actions OIDC auth."
  type        = string
  default     = "stima-github-actions-provider"
}

variable "github_repository" {
  description = "GitHub repository in owner/name format for OIDC repository lock."
  type        = string

  validation {
    condition     = can(regex("^[^/ ]+/[^/ ]+$", trimspace(var.github_repository)))
    error_message = "github_repository must be in owner/repo format."
  }
}
