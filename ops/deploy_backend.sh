#!/usr/bin/env bash
# Runs as root (called via: sudo bash deploy_backend.sh <image-tag>).
# Handles Docker container swap, NGINX config, certbot, and health check.
# Self-heals NGINX and TLS on every deploy so boot-time failures don't persist.
set -euo pipefail

IMAGE_TAG="${1:-}"
[[ -z "$IMAGE_TAG" ]] && { echo "Usage: $0 <image-tag>"; exit 1; }

ENV_FILE="${ENV_FILE:-/opt/stima/env/backend.env}"
INFRA_ENV="/opt/stima/env/infra.env"
CONTAINER_NAME="stima-backend"
WORKER_CONTAINER_NAME="stima-worker"
NGINX_SITE="/etc/nginx/sites-available/stima-backend"
ACME_WEBROOT="/var/www/acme-challenge"
CERTBOT_CMD="/opt/certbot-venv/bin/certbot"

[[ -f "$ENV_FILE" ]] || { echo "ERROR: Missing env file: $ENV_FILE"; exit 1; }

# Infra config (domain/email) written by startup script; not in backend.env.
[[ -f "$INFRA_ENV" ]] && source "$INFRA_ENV"
API_DOMAIN="${API_DOMAIN:-}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
LE_LIVE_DIR="/etc/letsencrypt/live/${API_DOMAIN}"

CONTAINER_PORT="$(grep -E '^PORT=[0-9]+$' "$ENV_FILE" | cut -d= -f2 | head -n1 || true)"
CONTAINER_PORT="${CONTAINER_PORT:-8000}"

# ZeroSSL EAB credentials — stored in backend.env so they travel with the deploy payload.
ZEROSSL_EAB_KID="$(grep -E '^ZEROSSL_EAB_KID=' "$ENV_FILE" | cut -d= -f2- | head -n1 || true)"
ZEROSSL_EAB_HMAC_KEY="$(grep -E '^ZEROSSL_EAB_HMAC_KEY=' "$ENV_FILE" | cut -d= -f2- | head -n1 || true)"

log_disk_state() {
  echo "Disk usage for /:"
  df -h / || true
  echo "Docker disk usage:"
  docker system df || true
}

reclaim_unused_docker_space() {
  echo "Pruning unused Docker containers and images..."
  docker container prune -f >/dev/null || true
  docker image prune -af >/dev/null || true
}

# ── Docker ────────────────────────────────────────────────────────────────────
if [[ -n "${GHCR_USERNAME:-}" && -n "${GHCR_TOKEN:-}" ]]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin >/dev/null
fi

echo "Checking Docker disk headroom before pull..."
log_disk_state
reclaim_unused_docker_space
echo "Docker disk headroom after cleanup:"
log_disk_state

echo "Pulling: $IMAGE_TAG"
docker pull "$IMAGE_TAG"

echo "Running migrations..."
docker run --rm --env-file "$ENV_FILE" "$IMAGE_TAG" alembic upgrade head

echo "Swapping containers..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm   "$CONTAINER_NAME" 2>/dev/null || true
docker stop "$WORKER_CONTAINER_NAME" 2>/dev/null || true
docker rm   "$WORKER_CONTAINER_NAME" 2>/dev/null || true

docker run -d \
  --name "$CONTAINER_NAME" \
  -p "127.0.0.1:${CONTAINER_PORT}:${CONTAINER_PORT}" \
  --env-file "$ENV_FILE" \
  --restart unless-stopped \
  "$IMAGE_TAG"

docker run -d \
  --name "$WORKER_CONTAINER_NAME" \
  --env-file "$ENV_FILE" \
  --restart unless-stopped \
  "$IMAGE_TAG" \
  arq app.worker.arq_worker.WorkerSettings

echo "Waiting for worker to stay running (up to 10s)..."
for i in $(seq 1 10); do
  if [[ "$(docker inspect -f '{{.State.Running}}' "$WORKER_CONTAINER_NAME" 2>/dev/null || true)" == "true" ]]; then
    echo "Worker is running."
    break
  fi
  if [[ "$i" -eq 10 ]]; then
    echo "ERROR: Worker failed to stay running."
    docker logs "$WORKER_CONTAINER_NAME" --tail=40
    exit 1
  fi
  sleep 1
done

echo "Recent worker logs:"
docker logs "$WORKER_CONTAINER_NAME" --tail=10

echo "Pruning unused Docker containers and images after deploy..."
reclaim_unused_docker_space

# ── NGINX ─────────────────────────────────────────────────────────────────────
install -d -m 755 /opt/stima/nginx "$ACME_WEBROOT"

# Upstream block: written once, persists across deploys.
if [[ ! -f /opt/stima/nginx/upstream.conf ]]; then
  cat > /opt/stima/nginx/upstream.conf <<UPSTREAM
upstream stima_backend {
    server 127.0.0.1:${CONTAINER_PORT};
}
UPSTREAM
fi

write_http_nginx_config() {
  cat > "$NGINX_SITE" <<NGINX
include /opt/stima/nginx/upstream.conf;

server {
    listen 80;
    server_name ${API_DOMAIN};
    client_max_body_size 2m;

    location ^~ /.well-known/acme-challenge/ {
        alias ${ACME_WEBROOT}/.well-known/acme-challenge/;
    }

    location / {
        proxy_pass http://stima_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
}

write_https_nginx_config() {
  cat > "$NGINX_SITE" <<NGINX
include /opt/stima/nginx/upstream.conf;

server {
    listen 80;
    server_name ${API_DOMAIN};
    client_max_body_size 2m;

    # Allow ACME HTTP-01 challenges through for cert renewal.
    location ^~ /.well-known/acme-challenge/ {
        alias ${ACME_WEBROOT}/.well-known/acme-challenge/;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name ${API_DOMAIN};
    client_max_body_size 2m;
    ssl_certificate     ${LE_LIVE_DIR}/fullchain.pem;
    ssl_certificate_key ${LE_LIVE_DIR}/privkey.pem;

    location / {
        proxy_pass http://stima_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
}

# If cert is present: HTTPS. If not: attempt certbot, then decide.
if [[ -f "${LE_LIVE_DIR}/fullchain.pem" && -f "${LE_LIVE_DIR}/privkey.pem" ]]; then
  echo "TLS cert found; writing HTTPS config."
  write_https_nginx_config
elif [[ -n "$API_DOMAIN" && -n "$CERTBOT_EMAIL" && -n "$ZEROSSL_EAB_KID" && -n "$ZEROSSL_EAB_HMAC_KEY" && -x "$CERTBOT_CMD" ]]; then
  echo "No TLS cert; attempting ZeroSSL certbot for ${API_DOMAIN}..."
  write_http_nginx_config
  ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/stima-backend
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && (systemctl reload nginx 2>/dev/null || systemctl start nginx)

  if "$CERTBOT_CMD" certonly --non-interactive --agree-tos \
       --email "$CERTBOT_EMAIL" --domains "$API_DOMAIN" \
       --webroot -w "$ACME_WEBROOT" \
       --server https://acme.zerossl.com/v2/DV90 \
       --eab-kid "$ZEROSSL_EAB_KID" \
       --eab-hmac-key "$ZEROSSL_EAB_HMAC_KEY"; then
    echo "Cert issued; writing HTTPS config."
    write_https_nginx_config
  else
    echo "WARNING: certbot failed; serving HTTP only."
  fi
else
  echo "No cert and certbot unavailable; writing HTTP config."
  write_http_nginx_config
fi

ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/stima-backend
rm -f /etc/nginx/sites-enabled/default

if nginx -t 2>/dev/null; then
  systemctl reload nginx 2>/dev/null || systemctl start nginx
  echo "NGINX reloaded."
else
  echo "ERROR: NGINX config test failed:"
  nginx -t
  exit 1
fi

# ── Health check ──────────────────────────────────────────────────────────────
echo "Waiting for app to be healthy (up to 60s)..."
for i in $(seq 1 12); do
  if curl -sf "http://127.0.0.1:${CONTAINER_PORT}/health" >/dev/null 2>&1; then
    echo "App is healthy. Deploy complete: $IMAGE_TAG"
    exit 0
  fi
  echo "  attempt $i/12..."
  sleep 5
done

echo "ERROR: App did not become healthy after 60s."
docker logs "$CONTAINER_NAME" --tail=40
exit 1
