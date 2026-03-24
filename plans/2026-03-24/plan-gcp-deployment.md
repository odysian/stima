# Stima GCP Deployment Plan

**Date:** 2026-03-24
**Status:** Decisions locked — ready for implementation.
**Pattern:** Vercel frontend (future) + GCP VM backend + fresh Cloud SQL — same topology as Quaero.

---

## Architecture

```
stima.odysian.dev        → Vercel (future — not in this task)
api.stima.odysian.dev    → GCP Compute Engine VM (e2-micro, us-east1-b)
                            └─ NGINX → Docker container (FastAPI, port 8000)
                            └─ TLS via ZeroSSL + certbot
Database                 → Cloud SQL (fresh instance, dedicated `stima` database, public schema)
Registry                 → GHCR (ghcr.io/odysian/stima/stima-backend)
Terraform state          → GCS backend (new bucket: `stima-terraform-state`)
WIF                      → New pool: `stima-github-actions-pool` (fully self-contained)
```

**Key differences from Quaero:**
- No ARQ worker / Redis queue — single `uvicorn` process only
- No GCS storage — PDF URL is nullable, future work
- No streaming endpoint — no special NGINX proxy config needed
- `ENVIRONMENT` var (not `APP_ENV`) for environment name
- Fresh Cloud SQL instance, dedicated `stima` database (see Database section)
- Cookie domain: `.stima.odysian.dev`, `SameSite=lax` (frontend + API are same-site subdomains)

---

## Confirmed Decisions

| Decision | Choice | Rationale |
|---|---|---|
| WIF pool | New pool `stima-github-actions-pool` | Self-contained TF state, no cross-state deps on Quaero, well within 4-pool quota |
| Terraform state | GCS backend, new bucket | Durable, remote-safe, avoids local state drift |
| Cloud SQL | Fresh instance, dedicated `stima` database | Clean isolation; `database.py` and `env.py` pass the URL directly with no `connect_args` for `search_path` — dedicated DB avoids needing code changes |
| Cloud SQL connectivity | Authorized networks (VM static IP) | Simplest for single-VM topology; add VM static IP to Cloud SQL authorized networks post-`terraform apply` |
| DB schema | `public` schema in dedicated `stima` DB | No search_path injection needed; matches how `database.py` and `env.py` work today |
| TRUSTED_PROXY_IPS | `172.17.0.1` | NGINX on host → container via Docker bridge; app sees Docker bridge gateway, not loopback (confirmed via Quaero runbook) |
| Frontend | Not in this task | Vercel setup is a separate walkthrough |
| GHA SSH auth | WIF + IAP ephemeral key injection | No static `gha-deploy` key stored anywhere; `gcloud compute ssh --tunnel-through-iap` generates ephemeral keys at deploy time |
| Cloud SQL provisioning | `gcloud` (manual, one-time) | Keeps TF state simple; Cloud SQL instance lifecycle is long-lived and independent of app deploys |

---

## Code Changes Required Before First Deploy

### `backend/app/main.py` — `/health` endpoint
Deploy script probes `http://127.0.0.1:8000/health` to gate every deploy. **Already patched** — `GET /health` returns `{"status": "ok"}`.

---

## Files to Create / Modify

| File | Action |
|---|---|
| `backend/app/main.py` | ✅ Patched — `/health` route added |
| `backend/.env.example` | ✅ Patched — added `TRUSTED_PROXY_IPS`, `EXTRACTION_MODEL`, `TRANSCRIPTION_MODEL` |
| `backend/Dockerfile` | Add `COPY . .` + `CMD` — currently missing both |
| `backend/.dockerignore` | Exclude `.venv/`, `__pycache__/`, `.env`, `*.pyc`, test fixtures |
| `infra/terraform/main.tf` | VM, static IP, firewall, service accounts. No GCS bucket block. |
| `infra/terraform/variables.tf` | All stima-scoped variable declarations |
| `infra/terraform/outputs.tf` | WIF provider resource name, deploy SA email, VM static IP |
| `infra/terraform/backend.tf` | GCS remote state config |
| `infra/terraform/github_actions_oidc.tf` | New WIF pool + provider, Stima SA bindings |
| `infra/terraform/iap_deploy.tf` | Deploy SA, IAP/IAM bindings |
| `infra/terraform/scripts/startup.sh.tftpl` | Identical to Quaero — no app-specific logic in bootstrap |
| `infra/terraform/envs/prod.tfvars` | Stima values (see section below) |
| `ops/deploy_backend.sh` | Adapted from Quaero — stima paths/names, no streaming NGINX block |
| `.github/workflows/backend-deploy.yml` | Adapted from Quaero — stima image/container names |
| `.github/workflows/backend-deploy-emergency.yml` | Skip-tests variant |

---

## `prod.tfvars`

```hcl
project_id = "portfolio-488721"
region     = "us-east1"
zone       = "us-east1-b"

network        = "default"
subnetwork     = "default"
vm_name        = "stima-backend"
machine_type   = "e2-micro"
# No hardcoded image URL — main.tf uses a data source to resolve latest Debian 12 at apply time.
# If a specific image is needed, override here with the full self_link URL.
static_ip_name = "stima-backend-ip"

ssh_user             = "odys"
api_domain           = "api.stima.odysian.dev"
frontend_url         = "https://stima.odysian.dev"
backend_port         = 8000
enable_tls_bootstrap = true
certbot_email        = "colosimocj3@gmail.com"   # confirm this is still the right email
github_repository    = "odysian/stima"

# Only your personal key. GHA deploy uses WIF + IAP ephemeral key injection — no static gha-deploy key needed.
# Verify this is still your current public key before apply.
ssh_public_keys = [
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINClsRqrZj0g8db/gn/vreWAQ+s2M3RmHdLw1XLRtkIZ odys-personal",
]

# IAP tunnel range (35.235.240.0/20) must stay.
# The first IP is your current desktop/office IP — update it if it has changed.
# Check your current public IP with: curl -s ifconfig.me
ssh_source_ranges                = ["184.189.209.6/32", "35.235.240.0/20"]
allow_insecure_ssh_from_anywhere = false
```

**`vm_image`:** `main.tf` will use a Terraform data source (`data "google_compute_image"`) to resolve the latest Debian 12 image at apply time, so no version-pinned URL is needed in `prod.tfvars`. If you ever need to pin to a specific image (e.g., after a bad upstream release), add `vm_image = "<self_link_url>"` here to override.

---

## GCS Terraform State Backend

New bucket provisioned once before `terraform init`.

> **PAUSE — run manually:**
```bash
gcloud storage buckets create gs://stima-terraform-state \
  --project=portfolio-488721 \
  --location=us-east1 \
  --uniform-bucket-level-access
```

`backend.tf`:
```hcl
terraform {
  backend "gcs" {
    bucket = "stima-terraform-state"
    prefix = "terraform/state"
  }
}
```

---

## GCP Resource Naming (no conflicts with Quaero)

| Resource | Stima name |
|---|---|
| VM | `stima-backend` |
| Static IP | `stima-backend-ip` |
| VM service account | `stima-backend-sa` |
| Deploy service account | `stima-github-deploy-sa` |
| WIF pool | `stima-github-actions-pool` |
| WIF provider | `stima-github-actions-provider` |
| Firewall rules | `stima-allow-http`, `stima-allow-https`, `stima-allow-ssh` |
| Network tag | `stima-backend` |
| Terraform state bucket | `stima-terraform-state` |

---

## ZeroSSL EAB Credentials

Certbot uses ZeroSSL as the ACME CA (same as Quaero). You need EAB (External Account Binding) credentials.

> **PAUSE — manual step (one-time):**
> 1. Log in to your ZeroSSL account at zerossl.com.
> 2. Go to **Developer** → **EAB Credentials** → **Generate EAB Credentials**.
> 3. Copy the **EAB KID** and **EAB HMAC Key**.
> 4. These go into `BACKEND_ENV_B64` as `ZEROSSL_EAB_KID` and `ZEROSSL_EAB_HMAC_KEY`.
>
> The deploy script reads these from `backend.env` and passes them to `certbot` on first-run TLS bootstrap.

---

## Cloud SQL (Fresh Instance — Manual)

> **PAUSE — manual step:**

### 1. Provision the instance

```bash
gcloud sql instances create stima-db \
  --database-version=POSTGRES_16 \
  --edition=ENTERPRISE \
  --tier=db-f1-micro \
  --region=us-east1 \
  --project=portfolio-488721 \
  --storage-type=SSD \
  --storage-size=10GB \
  --no-backup
```

This takes ~5 minutes.

### 2. Get the public IP

```bash
gcloud sql instances describe stima-db \
  --project=portfolio-488721 \
  --format="value(ipAddresses[0].ipAddress)"
```

### 3. Add VM static IP to authorized networks

Do this after `terraform apply` resolves the static IP:
```bash
STATIC_IP=$(terraform -chdir=infra/terraform output -raw vm_static_ip)
gcloud sql instances patch stima-db \
  --project=portfolio-488721 \
  --authorized-networks="${STATIC_IP}/32"
```

### 4. Set the postgres superuser password

```bash
gcloud sql users set-password postgres \
  --instance=stima-db \
  --project=portfolio-488721 \
  --password=<strong-password>
```

### 5. Database and user setup

Connect via Cloud SQL Auth Proxy or `gcloud sql connect`:
```bash
gcloud sql connect stima-db --user=postgres --project=portfolio-488721
```

Then run:
```sql
CREATE DATABASE stima;
CREATE USER stima_app WITH PASSWORD '<strong-password>';

\c stima

GRANT ALL PRIVILEGES ON DATABASE stima TO stima_app;
GRANT ALL PRIVILEGES ON SCHEMA public TO stima_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO stima_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO stima_app;
```

No schema isolation needed — dedicated database, `public` schema, `DATABASE_URL` points directly to `stima`.

---

## Production ENV (`BACKEND_ENV_B64`)

Fill in all `<placeholder>` values before base64-encoding.

```env
ENVIRONMENT=production
DATABASE_URL=postgresql+asyncpg://stima_app:<password>@<cloud-sql-ip>:5432/stima
SECRET_KEY=<random 64-char hex — generate with: openssl rand -hex 32>
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30
COOKIE_SECURE=true
COOKIE_HTTPONLY=true
COOKIE_SAMESITE=lax
COOKIE_DOMAIN=.stima.odysian.dev
FRONTEND_URL=https://stima.odysian.dev
ALLOWED_ORIGINS=https://stima.odysian.dev
TRUSTED_PROXY_IPS=172.17.0.1
ANTHROPIC_API_KEY=<key>
OPENAI_API_KEY=<key>
EXTRACTION_MODEL=claude-haiku-4-5-20251001
TRANSCRIPTION_MODEL=whisper-1
PORT=8000
ZEROSSL_EAB_KID=<from-zerossl-account>
ZEROSSL_EAB_HMAC_KEY=<from-zerossl-account>
```

Generate `SECRET_KEY`:
```bash
openssl rand -hex 32
```

Base64-encode the file:
```bash
base64 -w0 production.env
```

**`TRUSTED_PROXY_IPS=172.17.0.1`:** NGINX on the host proxies to the container via `-p 127.0.0.1:8000:8000`. Inside Docker, the host appears as the Docker bridge gateway (`172.17.0.1`), not loopback. The app's `get_ip_key()` must see this as a trusted hop to extract the real client IP from `X-Forwarded-For`.

**`PORT=8000`:** Read by the deploy script when generating the NGINX upstream config — not read by the app itself (uvicorn port is hardcoded in the Dockerfile CMD).

---

## GitHub Secrets & Variables

> **PAUSE — set in GitHub repo settings after `terraform apply`:**

**Repository variables** (`vars.*`) — not sensitive, set under Settings → Secrets and variables → Actions → Variables:
```
GCP_WIF_PROVIDER     = <value from: terraform -chdir=infra/terraform output -raw wif_provider_name>
GCP_DEPLOY_SA_EMAIL  = stima-github-deploy-sa@portfolio-488721.iam.gserviceaccount.com
GCP_VM_NAME          = stima-backend
GCP_PROJECT_ID       = portfolio-488721
GCP_VM_ZONE          = us-east1-c
```

**Repository secrets** (`secrets.*`) — set under Settings → Secrets and variables → Actions → Secrets:
```
GHCR_USERNAME    = odysian
GHCR_TOKEN       = <GitHub PAT with packages:write + read:packages scopes>
BACKEND_ENV_B64  = <output of: base64 -w0 production.env>
```

`GHCR_TOKEN`: Generate at GitHub → Settings → Developer settings → Personal access tokens → Fine-grained (or classic with `write:packages`). Use a dedicated token, not your personal login token.

---

## Cloudflare DNS

> **PAUSE — set in Cloudflare dashboard after `terraform apply`:**

Get the VM static IP:
```bash
terraform -chdir=infra/terraform output -raw vm_static_ip
```

Create the DNS record in Cloudflare for the `odysian.dev` zone:

| Type | Name | Content | Proxy status | TTL |
|---|---|---|---|---|
| A | `api.stima` | `<vm-static-ip>` | **DNS only (grey cloud)** | Auto |

**Proxy must be off (DNS only).** Certbot's HTTP-01 challenge requires direct resolution to the VM IP. Enabling Cloudflare proxy (orange cloud) will route traffic through Cloudflare and break TLS bootstrap.

Wait for propagation before first deploy:
```bash
watch -n 5 'dig +short api.stima.odysian.dev'
# Should return the VM IP within 1-5 minutes for a fresh record
```

---

## Vercel (Deferred — Not in This Task)

This section is a placeholder. Steps to complete when Vercel setup is ready:

1. Connect `odysian/stima` repo to a Vercel project (odysian team or personal).
2. Set framework preset: **Vite**.
3. Set build command: `npm run build`, output directory: `dist`.
4. Set environment variable: `VITE_API_URL=https://api.stima.odysian.dev`.
5. Add `stima.odysian.dev` as a custom domain in Vercel.
6. In Cloudflare, add the Vercel CNAME record (Vercel provides this on domain setup). This one **can** be proxied.
7. Set `FRONTEND_URL=https://stima.odysian.dev` and `ALLOWED_ORIGINS=https://stima.odysian.dev` in `BACKEND_ENV_B64` (already set in the production env template above).

---

## Deployment Sequence (Full — With Pause Points)

### Phase 1: Prerequisites (all manual, do first)

**Step 1 — Verify your desktop IP**
```bash
curl -s ifconfig.me
```
Compare against `184.189.209.6` in `prod.tfvars`. Update if different before `terraform apply`.

**Step 2 — Get ZeroSSL EAB credentials** (see ZeroSSL section above)

**Step 3 — Create GCS state bucket** (see GCS section above)

**Step 4 — Provision Cloud SQL instance** (see Cloud SQL section, steps 1–2 only)

---

### Phase 2: Write and apply Terraform

**Step 5 — Write all Terraform files + `prod.tfvars`**

**Step 6 — Init and apply**
```bash
cd infra/terraform
terraform init
terraform plan -var-file=envs/prod.tfvars    # review — expect ~12 resources
terraform apply -var-file=envs/prod.tfvars
```

> **PAUSE — review `terraform plan` output before applying.**

**Step 7 — Capture outputs**
```bash
terraform output -raw vm_static_ip          # → for Cloud SQL authorized network + DNS
terraform output -raw wif_provider_name     # → for GCP_WIF_PROVIDER repo variable
```

---

### Phase 3: Complete Cloud SQL setup

**Step 8 — Add VM IP to Cloud SQL authorized networks** (Cloud SQL section, step 3)

**Step 9 — Create database and user** (Cloud SQL section, steps 4–5)

---

### Phase 4: Configure GitHub

**Step 10 — Set GitHub secrets and variables** (see GitHub Secrets section above)

---

### Phase 5: DNS and TLS

**Step 11 — Set Cloudflare DNS record** (see Cloudflare section above)

**Step 12 — Wait for propagation**
```bash
watch -n 5 'dig +short api.stima.odysian.dev'
```
Do not proceed until this returns the VM IP.

---

### Phase 6: First deploy

**Step 13 — Push to `main` or trigger manually**
```bash
gh workflow run backend-deploy.yml --ref main
```

The deploy script will:
1. Pull the image from GHCR
2. Run `alembic upgrade head`
3. Swap the container
4. Bootstrap TLS via certbot + ZeroSSL (first deploy only)
5. Write NGINX config + reload
6. Health-check `GET /health` (12 retries, 5s each)

**Step 14 — Verify**
```bash
curl https://api.stima.odysian.dev/health
# → {"status":"ok"}
```

---

### Each subsequent deploy (automated)

1. Push to `main` → CI tests run
2. Docker image built + pushed to GHCR (`sha-<commit>` + `latest` tags)
3. Deploy job uploads `backend.env` + `deploy_backend.sh` via IAP tunnel
4. Deploy script: pull → migrate → swap container → NGINX reload → health check

---

## Rollback

Same pattern as Quaero:
```bash
# On the VM:
docker pull ghcr.io/odysian/stima/stima-backend:<previous-sha>
docker stop stima-backend
docker run -d --name stima-backend ... ghcr.io/odysian/stima/stima-backend:<previous-sha>
```

Or re-trigger the deploy workflow with the previous commit SHA.
