# Production Readiness Checklist

Use this as the final deployment gate for the current post-hardening system.

## Mandatory checks

- [ ] Config guards pass with a strong `SECRET_KEY`, correct cookie settings, and explicit runtime URLs.
- [ ] Proxy/header alignment is verified for `ALLOWED_HOSTS`, `TRUSTED_PROXY_IPS`, HTTPS redirect behavior, and shared-domain cookies.
- [ ] Redis connectivity is healthy for the API and worker.
- [ ] Worker startup succeeds and background jobs transition out of `pending`.
- [ ] GCS logo bucket remains private with public access prevention enabled.
- [ ] Dependency review or scanner pass is complete for the release window.
- [ ] Structured operational/security logs are flowing with correlation IDs and no raw tokens or credentials.

## Documentation completeness matrix

| Infra component introduced in Tasks 1-7 | Documentation target | Status |
| --- | --- | --- |
| auth/session hardening controls | `docs/ARCHITECTURE.md` auth model + observability sections | [x] |
| public-share/token surfaces | `docs/ARCHITECTURE.md` public routes + observability sections | [x] |
| provider quota/retry and 429 behavior | `docs/ARCHITECTURE.md` observability + quote extraction guardrails, `docs/PATTERNS.md` observability pattern | [x] |
| async worker/job failure handling | `docs/runbooks/worker-startup-monitoring.md` + `docs/ARCHITECTURE.md` observability section | [x] |
| Redis provisioning and runtime dependency | `docs/runbooks/redis-provisioning-config.md` + `docs/ARCHITECTURE.md` production infrastructure | [x] |
| proxy/header trust alignment | `docs/runbooks/proxy-header-alignment.md` | [x] |
| dependency/security review cadence | `docs/runbooks/dependency-security-review-cadence.md` + this checklist | [x] |

## Runbook index

- [redis-provisioning-config.md](/home/odys/stima/docs/runbooks/redis-provisioning-config.md)
- [worker-startup-monitoring.md](/home/odys/stima/docs/runbooks/worker-startup-monitoring.md)
- [gcs-bucket-security.md](/home/odys/stima/docs/runbooks/gcs-bucket-security.md)
- [proxy-header-alignment.md](/home/odys/stima/docs/runbooks/proxy-header-alignment.md)
- [emergency-share-token-revoke.md](/home/odys/stima/docs/runbooks/emergency-share-token-revoke.md)
- [dependency-security-review-cadence.md](/home/odys/stima/docs/runbooks/dependency-security-review-cadence.md)
