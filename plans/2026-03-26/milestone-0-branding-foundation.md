# Plan: Milestone 0 — Branding Foundation

**Date:** 2026-03-26
**Roadmap ref:** `docs/V1_ROADMAP.md` — Milestone 0
**Mode:** single (one task, one PR)

---

## Goal

Every PDF a contractor generates carries their business logo. Logo is managed from the Settings screen with a preview, upload, and remove action.

---

## Non-Goals

- Logo rendered on the public quote landing page (Milestone 2 consumes the asset; rendering it there is out of scope here)
- CDN, image resizing, or cropping
- Multiple logos per user
- Logo deletion without explicit user confirmation

---

## Constraints

- Private GCS bucket (Application Default Credentials on the backend VM) — no public URLs ever leave the backend
- GCE ADC requires both IAM on the VM service account and a storage-capable OAuth scope on the VM instance; Terraform must cover both or runtime access will fail
- PDF logo embed via base64 data URI — no outbound network call during WeasyPrint render
- Settings preview served via a proxy endpoint (`GET /api/profile/logo`) — frontend never holds a GCS URL
- Max 2 MB, JPEG and PNG only, validated by magic bytes on the backend (not `Content-Type` header)
- `storage_service` must be general-purpose, not logo-specific — V2 photo documentation reuses it with a different path prefix
- Remove action gated behind `ConfirmModal`
- Infrastructure (GCS bucket) is in scope for this task
- Preview responses must avoid stale browser cache after upload/replace/remove

---

## Design Note: "Previously Generated PDFs Unaffected"

The roadmap AC states this but PDFs in V0 are streamed on-demand — there are no stored PDF blobs. In practice, a logo change affects all future PDF renders for existing quotes. This is correct behavior, not a regression. The AC is interpreted as: existing quote data and status are unchanged; only the visual output of future renders reflects the current logo state.

---

## Implementation Plan

### Step 1 — Infrastructure

- Files touched: `infra/terraform/main.tf`, `infra/terraform/variables.tf`, `infra/terraform/envs/prod.tfvars`, `infra/terraform/outputs.tf` (if needed), `infra/terraform/scripts/startup.sh.tftpl` only if startup-managed env wiring changes, plus README/ops docs if deployment instructions change
- Add Terraform resource: private GCS bucket, uniform bucket-level access, `public_access_prevention = "enforced"`, no public ACLs
- IAM binding: backend service account → `roles/storage.objectAdmin` scoped to the bucket
- Add a storage-capable VM OAuth scope in Terraform/prod tfvars (`cloud-platform` or `devstorage.read_write`) so ADC inside the backend container can actually reach GCS
- Document `GCS_BUCKET_NAME` as a required backend env var (no default — startup must fail if unset)
- Explicit deploy note: production also requires updating the `BACKEND_ENV_B64` GitHub secret to include `GCS_BUCKET_NAME=<bucket-name>` before deploy; this is an operator step, not a code change

### Step 2 — Config + Storage Service

Files touched: `backend/app/core/config.py`, `backend/app/core/tests/test_config.py`, `backend/app/integrations/storage.py`, `backend/app/shared/dependencies.py`, `backend/conftest.py`, `backend/requirements.txt`

- Add `gcs_bucket_name: str` to `Settings` with `validation_alias="GCS_BUCKET_NAME"` and no default
- Add `google-cloud-storage` to backend dependencies
- Create `backend/app/integrations/storage.py`:
  - Class `StorageService(bucket_name: str)`
  - `upload(prefix: str, filename: str, data: bytes, content_type: str) -> str` — writes to `{prefix}{filename}`, returns object path
  - `delete(object_path: str) -> None` — removes object; no-op if not found
  - `fetch_bytes(object_path: str) -> bytes` — returns raw bytes; raises `StorageNotFoundError` if missing
  - Custom exception `StorageNotFoundError(Exception)`
  - Uses `google.cloud.storage.Client()` (ADC, no explicit credentials)
- Centralize image signature detection in one backend helper reused by upload validation, proxy response `Content-Type`, and PDF data URI generation
- Add `get_storage_service() -> StorageService` to `backend/app/shared/dependencies.py`: module-level singleton keyed on `settings.gcs_bucket_name`; profile and quote services receive it via `Depends(get_storage_service)`
- Update shared backend test bootstrap (`backend/conftest.py`) so app startup still works under pytest once `GCS_BUCKET_NAME` becomes required

### Step 3 — DB Migration + Profile Backend

Files touched: new Alembic migration, `backend/app/features/auth/models.py`, `backend/app/features/profile/repository.py`, `backend/app/features/profile/schemas.py`, `backend/app/features/profile/api.py`, `backend/app/features/profile/service.py`, `backend/app/features/profile/tests/test_profile.py`, `backend/app/features/profile/tests/test_logo.py` (new)

- **Migration:** add `logo_path TEXT NULL` to `users` table
- **Model:** add `logo_path: Mapped[str | None]` to `User`
- **Repository:** add `update_logo_path(user_id, path: str)` and `clear_logo_path(user_id)`
- **Schema:** add `has_logo: bool` to `ProfileResponse` (computed from `logo_path IS NOT NULL` — never expose the raw GCS path in API responses)
- **Service:** validates magic bytes (`JPEG: FF D8 FF`, `PNG: 89 50 4E 47`) and 2 MB limit; orchestrates GCS upload then DB update. Atomicity decision: on DB failure after a successful GCS write, return 500 with no GCS rollback — the fixed path is self-healing on retry. On GCS delete failure (non-`StorageNotFoundError`), return 500 and do not clear `logo_path` — avoids DB pointing to a missing object.
- **Three new endpoints under `/api/profile/logo`:**
  - `POST /api/profile/logo` — multipart `file` field; CSRF required; delegates validation and upload orchestration to the service; uploads to `logos/{user_id}/logo` (fixed object key with no misleading extension); updates `logo_path`; returns updated `ProfileResponse`
  - `DELETE /api/profile/logo` — CSRF required; calls service to delete GCS object and clear `logo_path`; returns 204 on success, 500 if GCS delete fails (`logo_path` left unchanged)
  - `GET /api/profile/logo` — no CSRF (read); fetches bytes from GCS, proxies back with correct `Content-Type` and `Cache-Control: no-store`; returns 404 if `logo_path` is null or object not found
- Automated tests must use dependency overrides/fakes for storage service; no backend verify target should require live GCS

### Step 4 — PDF Rendering

Files touched: `backend/app/features/quotes/repository.py`, `backend/app/features/quotes/service.py`, `backend/app/features/quotes/tests/test_pdf.py`, `backend/app/features/quotes/tests/test_pdf_template.py`, `backend/app/templates/quote.html`

- Add `logo_data_uri: str | None` to `QuoteRenderContext` dataclass
- Inject `storage_service` into `QuoteService` via shared dependencies
- In both `generate_pdf()` and `generate_shared_pdf()`, before calling `PdfIntegration.render()`:
  - If the render context has `logo_path`, call `storage_service.fetch_bytes(logo_path)`, base64-encode, build `data:image/{type};base64,{b64}` string
  - If fetch raises `StorageNotFoundError` or any other exception: log a warning and continue with `logo_data_uri = None` — logo is non-blocking for PDF generation
  - Detect image type from magic bytes (same check as upload validation) to set correct MIME type in the data URI
- `QuoteRenderContext` query must include the user's `logo_path`
- `quote.html` template: add `<img>` to the header block when `logo_data_uri` is set, constrained by `max-height: 48px; width: auto` so large uploads cannot break layout

### Step 5 — Frontend

Files touched: `frontend/src/features/profile/types/profile.types.ts`, `frontend/src/features/profile/services/profileService.ts`, `frontend/src/features/profile/tests/profileService.integration.test.ts`, `frontend/src/features/settings/components/SettingsScreen.tsx`, `frontend/src/features/settings/tests/SettingsScreen.test.tsx`

- **Types:** add `has_logo: boolean` to `ProfileResponse` type
- **Service:** add `uploadLogo(file: File): Promise<ProfileResponse>`, `deleteLogo(): Promise<void>`; use `FormData` for upload and keep preview src as `/api/profile/logo` (proxied — no service call needed for display)
- **SettingsScreen:**
  - Add a compact logo section at the top of the Business Profile card
  - When `has_logo`: render `<img src="/api/profile/logo">` constrained to `h-12` (48px), alongside an "Upload new" file picker and a "Remove" button
  - When `!has_logo`: render a file picker with a short label ("Upload logo")
  - File picker: `accept="image/jpeg,image/png"` as first-line UX guard; on change, call `uploadLogo()`, reload profile on success
  - Remove button: opens `ConfirmModal` ("Remove logo?", "This will remove your logo from all future PDFs."); on confirm, calls `deleteLogo()`, reloads profile
  - Upload and delete errors surface via `FeedbackMessage`
  - Keep save-profile success/error state separate from logo upload/delete feedback so one flow does not stomp the other

---

## Deferred Follow-Up (Not Part of This Task)

If desired later, sign-out confirmation on Settings should be its own frontend-only Task. It is intentionally excluded here to keep Milestone 0 focused on logo storage/rendering only.

---

## Risks and Edge Cases

| Risk | Mitigation |
|---|---|
| GCS fetch fails at PDF render time | Catch, log warning, continue — logo is non-blocking |
| VM has bucket IAM but lacks storage OAuth scope | Add storage-capable scope in Terraform/prod tfvars; verify before deploy |
| `Content-Type` header spoofed on upload | Validate magic bytes on backend; `Content-Type` is ignored for type determination |
| Replacement race (upload while PDF renders) | Fixed path means in-flight render gets whichever GCS version it reads. Acceptable for V1. |
| `GCS_BUCKET_NAME` not set in prod | No default value — settings validation fails at startup |
| Logo breaks PDF layout | `max-height: 48px; width: auto` in template CSS |
| Preview shows stale image after replace/delete | Return `Cache-Control: no-store` from `GET /api/profile/logo` |
| File picker accepts wrong format before backend validates | `accept="image/jpeg,image/png"` as UX guard; backend is authoritative |
| Old GCS objects accumulating | Fixed path per user (`logos/{user_id}/logo`) means replacement overwrites; no orphan accumulation |
| GCS write succeeds, DB update fails on upload | Return 500; no GCS rollback — fixed path overwrites on retry, self-healing |
| GCS delete fails (non-"not found") on `DELETE /logo` | Return 500; do not clear `logo_path` — avoids DB pointing to a missing object |
| Required env var breaks unrelated backend tests | Set `GCS_BUCKET_NAME` in shared pytest bootstrap and config tests |

---

## Acceptance Criteria

- [ ] Upload JPEG ≤ 2 MB → 200, `has_logo: true` in next profile fetch, preview appears in Settings
- [ ] Upload PNG ≤ 2 MB → same as above
- [ ] Upload file > 2 MB → 422
- [ ] Upload file with JPEG extension but invalid magic bytes → 422
- [ ] Upload file with wrong extension but valid JPEG magic bytes → accepted (content wins over name)
- [ ] `GET /api/profile/logo` with no logo uploaded → 404
- [ ] `GET /api/profile/logo` with logo → returns image bytes with correct `Content-Type` and `Cache-Control: no-store`
- [ ] Generate PDF with logo uploaded → logo renders in header, constrained to 48px height
- [ ] Generate shared/public PDF for a quote with logo uploaded → logo renders there too
- [ ] Generate PDF with no logo → header renders business name only, no broken `<img>`
- [ ] Remove logo: confirm modal shown → cancel → logo unchanged
- [ ] Remove logo: confirm modal shown → confirm → `has_logo: false`, preview removed, future PDFs have no logo
- [ ] Re-upload replaces logo; no orphaned GCS objects accumulate (fixed-path overwrite) — manual verification via GCS bucket inspection
- [ ] `GCS_BUCKET_NAME` unset → backend refuses to start
- [ ] Automated backend/frontend test suites pass without live GCS credentials by using fakes/mocks/dependency overrides
- [ ] GCS unavailable at PDF render time → PDF still generates, logo omitted, no 500

---

## Verification Plan

```bash
# Backend
make backend-verify

# Frontend
make frontend-verify

# Manual end-to-end (requires bucket provisioned and GCS_BUCKET_NAME set)
# 1. Upload JPEG logo via Settings → confirm preview renders
# 2. Generate a quote PDF → confirm logo appears in header
# 3. Open the shared/public PDF for the same quote → confirm logo appears there too
# 4. Upload replacement PNG → confirm preview updates, old object overwritten
# 5. Remove logo via confirm modal → confirm preview gone
# 6. Generate PDF again → confirm no logo, layout intact
# 7. Attempt upload of a > 2 MB file → confirm 422 and error message
# 8. Verify prod deploy inputs include bucket IAM, VM storage scope, and `GCS_BUCKET_NAME` in `BACKEND_ENV_B64`
```
