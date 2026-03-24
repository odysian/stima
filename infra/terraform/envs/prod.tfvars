project_id = "portfolio-488721"
region     = "us-east1"
zone       = "us-east1-c"

network        = "default"
subnetwork     = "default"
vm_name        = "stima-backend"
machine_type   = "e2-micro"
static_ip_name = "stima-backend-ip"

ssh_user             = "odys"
api_domain           = "api.stima.odysian.dev"
frontend_url         = "https://stima.odysian.dev"
backend_port         = 8000
enable_tls_bootstrap = true
certbot_email        = "colosimocj3@gmail.com"
github_repository    = "odysian/stima"

github_oidc_pool_id     = "stima-github-actions-pool"
github_oidc_provider_id = "stima-github-actions-provider"

# Only personal key — GHA deploy uses WIF + IAP ephemeral key injection.
ssh_public_keys = [
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINClsRqrZj0g8db/gn/vreWAQ+s2M3RmHdLw1XLRtkIZ odys-personal",
]

# IAP tunnel range must stay. First IP is desktop — update if it changes (curl -s ifconfig.me).
ssh_source_ranges                = ["184.189.209.6/32", "35.235.240.0/20"]
allow_insecure_ssh_from_anywhere = false
