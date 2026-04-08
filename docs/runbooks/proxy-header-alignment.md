# Proxy Header Alignment

Production runs on same-site subdomains under `.stima.odysian.dev`, so proxy forwarding and backend trust settings must stay aligned.

## Required env alignment

- `ALLOWED_HOSTS`
- `ENABLE_HTTPS_REDIRECT`
- `TRUSTED_PROXY_IPS`
- `COOKIE_DOMAIN`
- `FRONTEND_URL`

## Proxy requirements

- Forward `Host` correctly.
- Forward `X-Forwarded-Proto` and `X-Forwarded-For` only from trusted proxy hops.
- Do not allow arbitrary clients to spoof trusted forwarding headers.

## Validation

1. Confirm a proxied HTTPS request reaches the backend without redirect loops.
2. Confirm HSTS appears only on production HTTPS responses.
3. Confirm rate-limited and public-share logs hash the resolved client IP instead of logging it raw.
4. Confirm auth cookies are issued for the intended shared parent domain.

## Related runbooks

- [production-readiness-checklist.md](/home/odys/stima/docs/runbooks/production-readiness-checklist.md)
