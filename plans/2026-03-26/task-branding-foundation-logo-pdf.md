# Task: Milestone 0 branding foundation

## Goal
Add contractor logo upload/removal in Settings and render that logo on newly generated quote PDFs using private GCS-backed storage with no public asset URLs.

## Scope
**In:**
- Provision private GCS bucket access for the backend VM in Terraform
- Add required backend config and a general-purpose storage service
- Persist one optional logo object path per user
- Add authenticated profile logo upload, delete, and proxy-read endpoints
- Render uploaded logo in authenticated and shared quote PDF generation flows
- Add Settings UI for logo preview, upload, and remove confirmation
- Add automated tests using storage fakes/mocks and manual verification notes

**Out:**
- Public landing page logo rendering outside the existing shared PDF flow
- CDN, resizing, cropping, or multiple logos per user
- Historical PDF snapshot storage
- Settings sign-out confirmation polish

## Implementation notes
- Use a private GCS bucket only; frontend must never receive a bucket URL.
- GCE ADC needs both bucket IAM and a storage-capable VM OAuth scope, so Terraform must cover both.
- `GCS_BUCKET_NAME` is required with no default; startup should fail if unset.
- Store a fixed object key per user (`logos/{user_id}/logo`) to make replacement overwrite the prior asset cleanly.
- Reuse one backend image-signature helper for upload validation, proxy `Content-Type`, and PDF data URI MIME detection.
- `GET /api/profile/logo` should return `Cache-Control: no-store` so preview refreshes immediately after replace/remove.
- Backend/frontend automated verification must not require live GCS credentials; use dependency overrides, fakes, or mocks.
- Production rollout includes a non-code operator step: update `BACKEND_ENV_B64` to include `GCS_BUCKET_NAME=<bucket-name>`.

## Decision locks (backend-coupled only)
- [x] Locked: use a general-purpose private `storage_service` with path prefixes instead of logo-specific storage logic
- [x] Locked: future PDF renders always reflect the current logo because PDFs are rendered on demand and not stored as immutable blobs
- [x] Locked: logo fetch failures are non-blocking for PDF generation; omit the logo and continue instead of returning 500

## Acceptance criteria
- [ ] Upload JPEG <= 2 MB returns success, `has_logo: true`, and preview appears in Settings
- [ ] Upload PNG <= 2 MB returns success, `has_logo: true`, and preview appears in Settings
- [ ] Upload file > 2 MB returns 422
- [ ] Upload file with image extension but invalid magic bytes returns 422
- [ ] Upload file with wrong extension but valid JPEG/PNG magic bytes is accepted
- [ ] `GET /api/profile/logo` returns 404 when no logo exists
- [ ] `GET /api/profile/logo` returns correct image bytes, `Content-Type`, and `Cache-Control: no-store` when a logo exists
- [ ] Authenticated quote PDF generation renders the logo at max 48px height when present
- [ ] Shared/public quote PDF generation renders the logo when present
- [ ] Quote PDF generation without a logo preserves the current no-logo layout
- [ ] Remove logo requires `ConfirmModal`; cancel keeps the logo unchanged
- [ ] Remove logo confirm clears the logo, removes preview, and future PDFs render without logo
- [ ] Re-upload overwrites the fixed-path object without orphan accumulation
- [ ] Backend startup fails when `GCS_BUCKET_NAME` is unset
- [ ] Automated backend/frontend verification passes without live GCS credentials
- [ ] GCS fetch failure during PDF render logs and omits the logo without returning 500

## Verification
```bash
make backend-verify
make frontend-verify
```

Manual verification after bucket provisioning and env wiring:
```bash
# 1. Upload JPEG logo in Settings and confirm preview renders
# 2. Generate quote PDF and confirm logo appears in header
# 3. Open shared/public PDF for the same quote and confirm logo appears there too
# 4. Upload replacement PNG and confirm preview updates
# 5. Remove logo through ConfirmModal and confirm preview disappears
# 6. Generate PDF again and confirm layout is intact without logo
# 7. Attempt upload of a >2 MB file and confirm 422 + user-facing error
# 8. Confirm prod deploy inputs include bucket IAM, VM storage scope, and GCS_BUCKET_NAME in BACKEND_ENV_B64
```

## PR checklist
- [ ] PR references this issue (`Closes #...`)
- [ ] Docs updated if needed (architecture/patterns/review checklist/ADR)
- [ ] Tests added/updated where needed
