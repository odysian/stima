# GCS Bucket Security

Contractor logos are stored in GCS and must remain private-by-default.

## Required controls

- Enable uniform bucket-level access.
- Enable public access prevention.
- Grant least-privilege runtime IAM only to the backend service identity.
- Do not rely on per-object ACLs in app logic or incident response.

## Application contract

- The backend serves logo bytes through authenticated or token-gated backend routes.
- Public logo access is mediated by the backend share-token routes, not by direct bucket URLs.
- Missing or unreadable logo objects return backend-controlled `404` or `500` responses.

## Validation

1. Confirm the bucket is not publicly listable or readable.
2. Confirm the app can fetch expected logo objects through the configured service identity.
3. Confirm raw bucket object URLs are not exposed in API payloads or logs.

## Related runbooks

- [production-readiness-checklist.md](/home/odys/stima/docs/runbooks/production-readiness-checklist.md)
