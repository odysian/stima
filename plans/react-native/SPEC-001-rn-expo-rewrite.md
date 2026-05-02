# Umbrella Spec: React Native / Expo Native Client for Stima

> **Status:** Planning  
> **Scope:** New native mobile frontend/client; backend remains source-of-truth with mobile auth additions. Existing PWA remains supported.  
> **Non-Goal:** Replacing the existing PWA. The web app continues to serve browser users; this spec adds a native mobile client.

---

## 1. Context & Rationale

Stima is a mobile-first quoting app for solo tradespeople, currently shipping as a PWA (`frontend/` Vite + Tailwind + React Router). The PWA works well for browser-based capture, but has persistent friction in the field:

- **Voice capture reliability:** `MediaRecorder` in WebViews / Safari has inconsistent format support and background behavior.
- **Offline durability:** IndexedDB storage quotas and browser eviction policies make long-duration offline capture risky for a user's primary income tool.
- **Native platform affordances:** Push notifications, share sheets, PDF handling, and microphone permissions feel second-class in a browser tab.
- **Distribution friction:** PWAs require the user to "Add to Home Screen"; a native app removes that drop-off.

A React Native / Expo app lets us preserve the React/TypeScript/feature-folder architecture while gaining native storage (SQLite), reliable audio capture (`expo-audio`), and app-store distribution.

---

## 2. Current Architecture Snapshot

The existing frontend is well-factored for a port. We preserve the feature boundaries; we replace the runtime bindings.

### 2.1 Frontend Stack (to be replaced)

| Concern | Current | Replacement |
|---------|---------|-------------|
| Bundler | Vite (`frontend/vite.config.ts`) | Expo CLI / Metro |
| Styling | Tailwind CSS v4 (`frontend/src/index.css`) | Restyle or StyleSheet + design token system |
| Routing | `react-router-dom` v7 (`frontend/src/App.tsx`) | Expo Router (file-based) |
| State (server) | Custom `fetch` wrapper (`frontend/src/shared/lib/http.ts`) | React Query or native `fetch` wrapper |
| State (local) | IndexedDB + custom repos (`frontend/src/features/quotes/offline/captureDb.ts`) | `expo-sqlite` + Drizzle ORM |
| UI primitives | Custom components + Radix UI (`frontend/src/ui/`, `frontend/src/shared/components/`) | React Native primitives + custom component kit |
| Icons | `lucide-react` | `lucide-react-native` |
| Auth | Cookie-based CSRF (`http.ts`, `useAuth.ts`) | SecureStore-backed token auth (JWT access + refresh) |
| Voice | `MediaRecorder` + `navigator.mediaDevices` (`useVoiceCapture.ts`) | `expo-audio` recording |
| PDF/Share | Browser download / Web Share API | `expo-sharing` + `expo-print` |
| Updates | `vite-plugin-pwa` + custom `PwaUpdatePrompt` | EAS Update |

### 2.2 Backend Stack (preserved, with additions)

| Concern | Current | Addition |
|---------|---------|----------|
| Framework | FastAPI | — |
| Auth | Cookie + CSRF session | JWT access/refresh endpoints for mobile plus shared auth dependency support for bearer-token user resolution |
| API | REST JSON | Same resource contracts; shared auth/CSRF dependencies expand to support bearer auth without regressing cookie-auth web flows |
| Jobs | ARQ (Redis) | No change; mobile client polls same job status endpoint |
| Storage | GCS | Same pre-signed upload URLs |
| Transcription | OpenAI GPT-4o Transcribe | Backend already normalizes supported formats (WebM, MP4/M4A, AAC, WAV, MP3, OGG) to WAV before transcription; verify `expo-audio` iOS/Android output metadata is accepted by `infer_audio_format()` and decodable by ffmpeg/pydub |

---

## 3. Boundaries & Contracts

### 3.1 What We Keep

- **Backend resource contracts** — Quote/customer/invoice/job payloads and business semantics remain intact. The mobile build adds bearer-auth support in shared auth dependencies and keeps cookie-auth web behavior working; it does not redesign existing resource shapes.
- **Feature folder structure** — `features/<domain>/{components,hooks,services,types,utils}` pattern continues.
- **Business logic** — Outbox retry engine, capture state machine, idempotency logic, quote status helpers.
- **TypeScript domain types** — `Quote`, `Customer`, `LineItem`, `CaptureSession`, `OutboxJob`, etc.

### 3.2 What We Replace

- **Every DOM-based component** — No WebView wrappers; native RN components only.
- **Browser storage APIs** — `indexedDB`, `localStorage`, `sessionStorage` banned.
- **Browser-specific networking** — `document.cookie`, `window.fetch` with CSRF headers, `navigator.onLine` (use `@react-native-community/netinfo`).
- **PWA lifecycle** — Service workers, `beforeinstallprompt`, `vite-plugin-pwa` removed.

### 3.3 Cross-Cutting Concerns

- **Theme system** — Dark-first M3-inspired palette from `frontend/src/index.css` becomes a Restyle theme or StyleSheet token object.
- **Safe areas** — Replace CSS `env(safe-area-inset-*)` with `react-native-safe-area-context`.
- **Keyboard handling** — Replace CSS `env(keyboard-inset-height)` with `react-native-keyboard-aware-scroll-view` or `KeyboardAvoidingView`.

---

## 4. High-Level Plan

The rewrite is organized into **Phase 0 plus five implementation phases**. Phase 0 must complete before implementation tasks; phases 1–3 are sequential foundations; 4–5 run in parallel once the foundation is solid.

```
Phase 0: Native Contract Spike (3–5 days)
├── Prove mobile auth/audio/upload/PDF contracts end-to-end

Phase 1: Foundation (1 week)
├── Spec A: Expo Scaffold & Navigation
├── Spec B: Design Token → Restyle Theme
└── Spec C: Native Auth & HTTP Layer

Phase 2: Storage Engine (1 week)
├── Spec D: SQLite Schema & Offline Repositories
└── Spec E: Outbox Engine Port

Phase 3: Core Features (2 weeks, parallel)
├── Spec F: Capture Flow (voice + notes + extraction)
├── Spec G: Quote Review & Edit
├── Spec H: Quote List, Preview & Share
├── Spec I: Customers & Settings
└── Spec J: Onboarding & Profile

Phase 4: Native Integrations (1 week)
├── Spec K: PDF Generation & Sharing
├── Spec L: Deep Linking (public quote URLs)
└── Spec M: Push Notifications (optional v1.1)

Phase 5: Release (1 week)
├── Spec N: App Store Submission & EAS Update
```

---

## 5. Phase 0: Native Contract Spike

**Goal:** Prove the critical native-to-backend contracts end-to-end before committing to full feature porting. This spike de-risks auth, audio recording/upload, storage persistence, outbox sync, PDF generation, and deep linking.

**References:**
- `backend/app/features/auth/api.py` — Current cookie-based auth endpoints.
- `backend/app/integrations/audio.py` — `infer_audio_format()`, `SUPPORTED_AUDIO_FORMATS`, `normalize_and_stitch()`.
- `backend/app/features/quotes/api.py` — Extraction endpoint with multipart audio upload.
- `backend/app/features/quotes/service.py` — PDF artifact job lifecycle.
- `frontend/src/features/quotes/offline/outboxEngine.ts` — Outbox retry logic.
- `frontend/src/features/quotes/hooks/useQuoteDocumentActions.ts` — PDF generation and share flow.

**Acceptance Criteria:**
- [ ] Mobile login/refresh/logout/me works without weakening existing cookie+CSRF web auth.
- [ ] Bearer-auth mobile requests can read protected resources and perform existing mutating actions without requiring CSRF headers, while cookie-auth web requests still require CSRF on mutating routes.
- [ ] Native audio recording uploads successfully on iOS and Android.
- [ ] Actual `expo-audio` output MIME type, filename extension, and metadata are accepted by backend `infer_audio_format()` and decodable by ffmpeg/pydub.
- [ ] Native `file://` URI FormData upload works through the API.
- [ ] SQLite + filesystem capture persistence survives app restart.
- [ ] Foreground reconnect outbox sync works (queue job offline, reconnect, auto-sync).
- [ ] PDF job start → poll → artifact download → native share works end-to-end.
- [ ] Public `/doc/:token` link falls back to web and optionally opens the app via universal/app links.

**Effort:** 3–5 days

**Decision Locks (must resolve in Phase 0 before child issues):**
- **Server state:** TanStack Query vs. manual `fetch` wrapper. Child specs must not mix both patterns.
- **Styling:** Restyle vs. StyleSheet + design token helpers.
- **Navigation:** Expo Router (file-based) vs. React Navigation (imperative). Expo Router is recommended for greenfield.
- **Local storage:** Drizzle ORM vs. direct `expo-sqlite` repository helpers.
- **Audio recording:** Exact `expo-audio` platform options, output format, and filename/content-type metadata.

---

## 6. Child Spec Slices

Each child spec now lives in its own file for issue slicing while the umbrella spec remains the source of sequencing and cross-cutting constraints.

| Spec | File |
| --- | --- |
| Spec A: Expo Scaffold & Navigation | `plans/react-native/SPEC-001A-expo-scaffold-navigation.md` |
| Spec B: Design Token -> Restyle Theme | `plans/react-native/SPEC-001B-design-token-restyle-theme.md` |
| Spec C: Native Auth & HTTP Layer | `plans/react-native/SPEC-001C-native-auth-http-layer.md` |
| Spec D: SQLite Schema & Offline Repositories | `plans/react-native/SPEC-001D-sqlite-offline-repositories.md` |
| Spec E: Outbox Engine Port | `plans/react-native/SPEC-001E-outbox-engine-port.md` |
| Spec F: Capture Flow | `plans/react-native/SPEC-001F-capture-flow.md` |
| Spec G: Quote Review & Edit | `plans/react-native/SPEC-001G-quote-review-edit.md` |
| Spec H: Quote List, Preview & Share | `plans/react-native/SPEC-001H-quote-list-preview-share.md` |
| Spec I: Customers & Settings | `plans/react-native/SPEC-001I-customers-settings.md` |
| Spec J: Onboarding & Profile | `plans/react-native/SPEC-001J-onboarding-profile.md` |
| Spec K: PDF Generation & Sharing | `plans/react-native/SPEC-001K-pdf-generation-sharing.md` |
| Spec L: Deep Linking | `plans/react-native/SPEC-001L-deep-linking.md` |
| Spec M: Push Notifications (Optional v1.1) | `plans/react-native/SPEC-001M-push-notifications.md` |
| Spec N: App Store Submission & EAS Update | `plans/react-native/SPEC-001N-app-store-submission-eas-update.md` |

Each child spec below still summarizes the goal, acceptance criteria, key files to reference from the current codebase, and estimated effort.

---

### Spec A: Expo Scaffold & Navigation

**Goal:** Bootstrap the React Native project with Expo, set up file-based routing with Expo Router, and establish the navigation structure (tabs, stacks, modals).

**References:**
- `frontend/src/App.tsx` — Route definitions and route guards (`ProtectedRoute`, `PublicRoute`, `OnboardingRoute`, `RootHome`).
- `frontend/src/main.tsx` — Root providers (`AuthProvider`, `ThemeProvider`, `ToastProvider`, `BrowserRouter`).
- `frontend/src/shared/components/BottomNav.tsx` — Tab structure (Quotes, Customers, Settings).

**Acceptance Criteria:**
- [ ] Current stable Expo SDK project with TypeScript, file-based routing (`app/` directory); exact SDK version locked during Phase 0 after validating native module compatibility.
- [ ] Root layout with `SafeAreaProvider`, `GestureHandlerRootView`.
- [ ] Tab layout for authenticated users: Quotes (`/`), Customers (`/customers`), Settings (`/settings`).
- [ ] Stack modals for: Capture, Review/Edit, Quote Preview, Customer Detail, Customer Create.
- [ ] Auth-guarded route groups: `(public)` for login/register, `(app)` for authenticated features.
- [ ] Dark-first theme support via persisted app setting plus system appearance; no restart required.
- [ ] Loading screen matching current `LoadingScreen.tsx` aesthetic.

**Effort:** 3–5 days

---

### Spec B: Design Token → Restyle Theme

**Goal:** Port the M3-inspired token system from CSS custom properties to a JavaScript/TypeScript theme object usable by Restyle or StyleSheet.

**References:**
- `frontend/src/index.css` — Complete token catalog (colors, radii, shadows, fonts, safe-area vars).
- `frontend/UI_SYSTEM.md` — Primitive catalog, banned patterns, composition rules.
- `frontend/src/shared/components/Button.tsx` — Button variants (primary, secondary, ghost, danger) and sizes.
- `frontend/src/shared/components/Input.tsx` — Input states and styling.
- `frontend/src/ui/Sheet.tsx` — Modal/sheet surface styling (radius, shadow, backdrop).
- `frontend/src/ui/Toast.tsx` — Toast positioning and styling.

**Acceptance Criteria:**
- [ ] Theme object with typed colors (light/dark), spacing, border radii, breakpoints.
- [ ] `Box`, `Text`, `Card` Restyle primitives (or equivalent StyleSheet helpers) covering all current surface types.
- [ ] Button component with variants `primary`, `secondary`, `ghost`, `danger` and sizes `sm`, `md`, `lg`.
- [ ] Input component with states: default, focused, error, disabled.
- [ ] Sheet/Modal component with backdrop, safe-area insets, and dismiss gesture.
- [ ] Toast component with auto-dismiss, manual dismiss, and queue management.
- [ ] Typography system: `headline` (Space Grotesk), `body`/`label` (Inter).

**Effort:** 3–4 days

---

### Spec C: Native Auth & HTTP Layer

**Goal:** Add a bearer-token auth flow suitable for React Native, while keeping the existing cookie+CSRF web auth untouched.

**Decision Lock:** Mobile auth uses short-lived JWT access tokens plus opaque, server-stored refresh-token rotation stored in SecureStore. Cookie + CSRF auth remains unchanged for the PWA. Shared auth dependencies must resolve users from either the access cookie or the `Authorization: Bearer` header, and CSRF enforcement must remain in place for cookie-auth web endpoints while bypassing CSRF for bearer-auth mobile requests because there is no ambient browser cookie being automatically sent.

**References:**
- `frontend/src/shared/lib/http.ts` — `request()`, CSRF token management, cookie hydration, auth failure signaling.
- `frontend/src/features/auth/hooks/useAuth.ts` — Auth context, bootstrap flow, offline recovery, reverify logic.
- `frontend/src/features/auth/services/authService.ts` — Login, register, me, logout, refresh.
- `frontend/src/features/auth/offline/offlineUserSnapshot.ts` — Local auth caching for offline recovery.
- `frontend/src/features/auth/offline/authBootstrapErrors.ts` — Error classification (explicit auth failure vs. network).
- `backend/app/features/auth/api.py` — Current cookie-based login, refresh, logout, me endpoints.
- `backend/app/features/auth/service.py` — Auth service with JWT token creation/rotation.

**Acceptance Criteria:**
- [ ] Backend exposes additive mobile endpoints: `POST /api/auth/mobile-login`, `POST /api/auth/mobile-refresh`, `POST /api/auth/mobile-logout`, `GET /api/auth/mobile-me`.
- [ ] Mobile login/refresh returns `{ access_token, refresh_token }`, where `access_token` is a short-lived JWT and `refresh_token` is an opaque, server-stored, rotated token. No CSRF token for mobile.
- [ ] Mobile client stores refresh token in `expo-secure-store` (keychain-backed). Access token can be kept in memory or SecureStore.
- [ ] HTTP wrapper (`apiClient.ts`) sends `Authorization: Bearer <access_token>` on every request.
- [ ] Shared backend auth dependencies accept bearer auth for existing protected API routes; mobile clients can call quote/customer/invoice/profile/catalog/job endpoints without cookie hydration.
- [ ] CSRF enforcement becomes auth-mode aware: still required for cookie-auth web requests, not required for bearer-auth mobile requests.
- [ ] Refresh token is rotated server-side on every refresh call; consumed token is revoked.
- [ ] Automatic token refresh on 401: intercept 401, call mobile-refresh with stored refresh token, retry original request, or logout if refresh fails.
- [ ] Offline auth recovery: if NetInfo reports offline on bootstrap, restore user snapshot from SecureStore and enter `offline_recovered` mode.
- [ ] Auth context exposes same interface as current `useAuth`: `user`, `authMode`, `isLoading`, `isOnboarded`, `login`, `register`, `logout`, `refreshUser`.
- [ ] **Logout policy decision:** On logout, wipe all user-local capture data (capture sessions, audio clips, outbox jobs, drafts) from SQLite and filesystem, or explicitly document and justify preserving pending captures for offline recovery after re-login.

**Backend Note:** The existing cookie session (`/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/me`) must remain untouched for the PWA. Mobile endpoints are additive, but implementation scope also includes shared dependency changes so existing protected routes can authenticate via `Authorization` headers without weakening cookie-auth behavior.

**Effort:** 4–5 days (includes backend work)

---

### Spec D: SQLite Schema & Offline Repositories

**Goal:** Port all IndexedDB stores and repository logic to SQLite via `expo-sqlite` and Drizzle ORM.

**References:**
- `frontend/src/features/quotes/offline/captureDb.ts` — Store definitions, migration logic, connection handling, reset logic.
- `frontend/src/features/quotes/offline/captureRepository.ts` — Capture session CRUD, status marking, field updates.
- `frontend/src/features/quotes/offline/audioRepository.ts` — Audio clip persistence, blob storage.
- `frontend/src/features/quotes/offline/draftRepository.ts` — Local draft CRUD.
- `frontend/src/features/quotes/offline/outboxRepository.ts` — Outbox job CRUD, pending job listing, pause/unpause.
- `frontend/src/features/quotes/offline/captureSyncEventRepository.ts` — Sync event logging.
- `frontend/src/features/quotes/offline/captureTypes.ts` — Type definitions for local entities.

**Acceptance Criteria:**
- [ ] Drizzle schema files for all 5 stores: `capture_sessions`, `sync_events`, `audio_clips`, `local_drafts`, `outbox_jobs`.
- [ ] Equivalent indexes: `userId`, `status`, `sessionId`, `documentId`, etc.
- [ ] Repository functions match current signatures as closely as possible to minimize upstream changes.
- [ ] Audio clips: store metadata in SQLite; store blob on filesystem (`expo-file-system` cache directory). On iOS, handle `file://` URIs for upload.
- [ ] **Native upload contract:** Local clip model includes `uri`, `name`, `type`, `sizeBytes`, `durationSeconds`. Extraction `FormData` uses native file attachments from filesystem URIs; it does not depend on browser `Blob` storage.
- [ ] Storage health checks and reset logic ported (see `storageHealth.ts`).
- [ ] All repository unit tests passing in Jest with mocked SQLite driver.

**Effort:** 5–7 days

---

### Spec E: Outbox Engine Port

**Goal:** Port the background sync engine that retries failed capture submissions when connectivity returns.

**References:**
- `frontend/src/features/quotes/offline/outboxEngine.ts` — Core engine: `runOutboxPass`, `registerOnlineTrigger`, job processing, retry backoff, terminal failure handling.
- `frontend/src/features/quotes/offline/classifySubmitFailure.ts` — Maps errors to `offline` | `timeout` | `server_retryable` | `auth_required` | `validation_failed` | `server_terminal`.
- `frontend/src/features/quotes/offline/OutboxSyncCoordinator.tsx` — React component that listens for `online` events and triggers outbox passes.
- `frontend/src/features/quotes/components/captureScreenHelpers.ts` — Extraction polling constants (`EXTRACTION_MAX_POLLS`, `EXTRACTION_POLL_INTERVAL_MS`).

**Acceptance Criteria:**
- [ ] `runOutboxPass(userId)` executes identically: loads pending jobs, processes each, handles extraction timeout, polls for persisted quote.
- [ ] Retry backoff: `BACKOFF_BASE_MS * 2^(attempt-1)` capped at `BACKOFF_MAX_MS`.
- [ ] `registerOnlineTrigger` uses `@react-native-community/netinfo` instead of `window.addEventListener('online')`.
- [ ] Terminal failures mark capture status as `extract_failed` and emit sync events.
- [ ] Auth-required pauses block the outbox until explicit re-auth or `forceAfterAuth`.
- [ ] **Foreground reconnect sync is required.** Outbox runs when app opens, when auth is verified, and when NetInfo reports connection restored.
- [ ] **BackgroundTask is optional best-effort only.** Do not rely on `expo-background-task` for correctness; it is deferrable, OS-controlled, and may not run immediately.

**Effort:** 3–4 days

---

### Spec F: Capture Flow

**Goal:** Port the capture screen — voice recording, text notes, extraction submission, and local session management.

**References:**
- `frontend/src/features/quotes/components/CaptureScreen.tsx` — Orchestrator: local session, voice clips, notes, extraction, error handling, auto-extract on load.
- `frontend/src/features/quotes/components/CaptureScreenBody.tsx` — Notes input, clip list, record button, start-blank button.
- `frontend/src/features/quotes/components/CaptureScreenFooter.tsx` — Extract button, status copy, extraction stage spinner.
- `frontend/src/features/quotes/hooks/useVoiceCapture.ts` — MediaRecorder lifecycle, clip persistence, timer, duration limit.
- `frontend/src/features/quotes/hooks/useVoiceCapture.helpers.ts` — Mime type resolution, clip persistence, storage soft cap.
- `frontend/src/features/quotes/components/captureScreenIdempotency.ts` — Idempotency key resolution for extraction requests.
- `frontend/src/features/quotes/components/captureScreenPolling.ts` — Poll extraction job until quote is ready.
- `frontend/src/features/quotes/components/captureScreenOutbox.ts` — Queue outbox retry jobs on failure.
- `frontend/src/features/quotes/components/captureScreenDraftHydration.ts` — Hydrate draft from newly created quote.

**Acceptance Criteria:**
- [ ] Voice recording uses `expo-audio`; target output is AAC/M4A, with exact platform recording options locked in Phase 0.
- [ ] Recording timer counts up; auto-stops at `MAX_VOICE_CLIP_DURATION_SECONDS`.
- [ ] Clips display as clip rows with play icon, clip number, and duration (parity with current `CaptureInputPanel.tsx`). Waveform visualization is an enhancement, not parity.
- [ ] Notes multiline text input with character count.
- [ ] Extract button validates: max clip count, total byte size.
- [ ] Online flow: submit clips+notes, show extraction stages, poll job, navigate to review.
- [ ] Offline flow: save to outbox, show "Ready to extract when online".
- [ ] Start blank: create manual draft via API, navigate to edit.
- [ ] Unsaved-work guard on back navigation (ConfirmModal equivalent).
- [ ] Auto-extract on deep-link resume (`autoExtract=1`).

**Key Risk:** Native audio format. Backend already maps M4A/AAC to MP4 and normalizes to WAV via ffmpeg/pydub (`backend/app/integrations/audio.py`). The actual risk is whether `expo-audio` iOS/Android output produces filename/content-type metadata that `infer_audio_format()` can decode reliably.

**Effort:** 7–10 days

---

### Spec G: Quote Review & Edit

**Goal:** Port the review/edit screen for quotes and invoices — line item editing, customer assignment, pricing, status changes.

**References:**
- `frontend/src/features/quotes/components/ReviewScreen.tsx` — Main review screen with document type selector, customer row, line items section, action footer.
- `frontend/src/features/quotes/components/ReviewLineItemsSection.tsx` — Editable line item list with add/edit/delete.
- `frontend/src/features/quotes/components/LineItemEditSheet.tsx` — Bottom sheet for editing a line item (description, quantity, unit price).
- `frontend/src/features/quotes/components/ReviewCustomerRow.tsx` — Customer display + assignment sheet trigger.
- `frontend/src/features/quotes/components/ReviewCustomerAssignmentSheet.tsx` — Customer search/selection sheet.
- `frontend/src/features/quotes/components/ReviewActionFooter.tsx` — Actions: Save, Send, Convert to Invoice, Delete.
- `frontend/src/features/quotes/components/ReviewDocumentTypeSelector.tsx` — Toggle between quote and invoice.
- `frontend/src/features/quotes/components/DocumentEditScreenView.tsx` — Combined edit view wrapper.
- `frontend/src/features/quotes/components/DocumentEditOverlays.tsx` — Loading and error overlays.

**Acceptance Criteria:**
- [ ] Display quote/invoice header with status pill, created date, document number.
- [ ] Line items: editable list with swipe-to-delete or overflow menu.
- [ ] Line item edit modal with numeric fields for quantity/price, text field for description.
- [ ] Customer assignment: searchable list from local cache + API fallback.
- [ ] Pricing section: subtotal, tax, total with formatted currency.
- [ ] Action footer contextually shows: Save Draft, Send Quote, Approve & Invoice, Delete.
- [ ] Navigation guards for unsaved changes.

**Effort:** 5–7 days

---

### Spec H: Quote List, Preview & Share

**Goal:** Port the quote list dashboard, quote preview screen, and sharing flows.

**References:**
- `frontend/src/features/quotes/components/QuoteList.tsx` — Quote list with status filtering, empty state, FAB.
- `frontend/src/features/quotes/components/QuoteList.helpers.ts` — Filtering and grouping logic.
- `frontend/src/features/quotes/components/QuotePreview.tsx` — Read-only preview with header actions.
- `frontend/src/features/quotes/components/QuotePreviewActions.tsx` — Share, email, download actions.
- `frontend/src/features/quotes/components/QuotePreviewHeaderActions.tsx` — Overflow menu for edit/convert/delete.
- `frontend/src/features/quotes/components/QuotePreviewDialogs.tsx` — Confirm delete, confirm convert dialogs.
- `frontend/src/features/public/components/PublicQuotePage.tsx` — Public share page (may remain web-only; mobile shares link).
- `frontend/src/ui/EmptyState.tsx` — Empty state illustration + copy.

**Acceptance Criteria:**
- [ ] Quote list with tabs: All, Draft, Sent, Approved, Invoiced.
- [ ] Pull-to-refresh and infinite scroll (if paginated).
- [ ] FAB to initiate capture.
- [ ] Quote preview: full document render (header, line items, totals, notes, customer).
- [ ] Share action: generate public link using configured public web origin (`EXPO_PUBLIC_WEB_ORIGIN`), copy to clipboard, native share sheet (`expo-sharing`). Do not use `window.location.origin`.
- [ ] Email action uses the existing backend email endpoint (parity with PWA). `mailto` may be considered only as a fallback or deferred enhancement.
- [ ] PDF download: request artifact via `pdf_artifact.download_url`, save to device via `expo-file-system` + `expo-sharing`.

**Effort:** 4–5 days

---

### Spec I: Customers & Settings

**Goal:** Port customer management and app settings.

**References:**
- `frontend/src/features/customers/components/CustomerListScreen.tsx`
- `frontend/src/features/customers/components/CustomerDetailScreen.tsx`
- `frontend/src/features/customers/components/CustomerCreateScreen.tsx`
- `frontend/src/features/settings/components/SettingsScreen.tsx`
- `frontend/src/features/settings/components/SettingsProfileDisplayParts.tsx`
- `frontend/src/features/settings/components/SettingsBusinessProfileCard.tsx`
- `frontend/src/features/settings/components/SettingsCatalogShortcutCard.tsx`
- `frontend/src/features/line-item-catalog/components/LineItemCatalogSettingsScreen.tsx`
- `frontend/src/features/line-item-catalog/services/lineItemCatalogService.ts`

**Acceptance Criteria:**
- [ ] Customer list with search and alphabet section headers.
- [ ] Customer detail: contact info, address, associated quotes.
- [ ] Customer create: form with validation, phone formatting.
- [ ] Settings screen: business profile, line-item catalog shortcut, theme toggle, logout.
- [ ] Line-item catalog: CRUD for reusable line items.

**Effort:** 3–4 days

---

### Spec J: Onboarding & Profile

**Goal:** Port user onboarding (trade type, business info) and profile editing.

**References:**
- `frontend/src/features/profile/components/OnboardingForm.tsx` — Multi-step onboarding.
- `frontend/src/features/auth/components/LoginForm.tsx`
- `frontend/src/features/auth/components/RegisterForm.tsx`
- `frontend/src/features/auth/components/ForgotPasswordPage.tsx`
- `frontend/src/features/auth/components/ResetPasswordPage.tsx`

**Acceptance Criteria:**
- [ ] Login screen with email/password, link to register and forgot password.
- [ ] Register screen with validation, password requirements.
- [ ] Forgot password: email input, success state.
- [ ] Reset password: token validation, new password form.
- [ ] Onboarding: trade type selector, business name, timezone, logo upload (image picker).

**Effort:** 3–4 days

---

### Spec K: PDF Generation & Sharing

**Goal:** Port the PDF artifact flow to native sharing.

**References:**
- `frontend/src/features/quotes/hooks/useQuoteDocumentActions.ts` — `onGeneratePdf` starts job, polls via `jobService.getJobStatus`, refetches quote for `pdf_artifact`.
- `frontend/src/features/quotes/components/QuotePreview.tsx` — `openPdfUrl` from `quote.pdf_artifact.download_url`.
- `backend/app/features/quotes/service.py` — `start_pdf_generation`, `get_pdf_artifact`.
- Backend PDF generation (`WeasyPrint + Jinja2`) — already produces PDFs; mobile consumes them.

**Acceptance Criteria:**
- [ ] Start PDF generation with existing `POST /api/quotes/{id}/pdf` job endpoint.
- [ ] Poll/resume the job via `jobService.getJobStatus` (same as web).
- [ ] Refetch quote detail to get updated `pdf_artifact` state.
- [ ] GET the PDF artifact from `pdf_artifact.download_url`.
- [ ] Save to `expo-file-system` cache directory.
- [ ] Open share dialog via `expo-sharing` with PDF MIME type.
- [ ] Option to print via `expo-print`.

**Effort:** 1–2 days

---

### Spec L: Deep Linking

**Goal:** Handle public quote URLs and app-internal deep links.

**References:**
- `frontend/src/features/public/components/PublicQuotePage.tsx` — Public quote viewer.
- `frontend/src/App.tsx` — Route `/doc/:token`.

**Acceptance Criteria:**
- [ ] `https://stima.odysian.dev/doc/<token>` opens the app if installed, or falls back to web.
- [ ] Universal links (iOS) and app links (Android) configured.
- [ ] Internal deep link: `stima://quotes/capture` for shortcuts.

**Effort:** 2–3 days

---

### Spec M: Push Notifications (Optional v1.1)

**Goal:** Notify users when extraction completes or a quote is viewed.

**Acceptance Criteria:**
- [ ] `expo-notifications` setup with permissions.
- [ ] Backend push token registration endpoint.
- [ ] Notification categories: extraction complete, quote viewed, invoice paid.

**Effort:** 2–3 days (deferred to v1.1 if needed)

---

### Spec N: App Store Submission & EAS Update

**Goal:** Ship to TestFlight and Google Play Internal Testing.

**Acceptance Criteria:**
- [ ] App icons for all densities (iOS + Android).
- [ ] Splash screen matching brand.
- [ ] EAS Build profiles for development, preview, production.
- [ ] EAS Update channel for OTA fixes.
- [ ] iOS: App Store Connect metadata, privacy manifest, microphone usage description.
- [ ] Android: Play Console listing, adaptive icons, microphone permission rationale.
- [ ] Initial submission to TestFlight + Play Internal Testing.

**Effort:** 2–3 days

---

## 7. Observability

- **Sentry React Native** setup with breadcrumb instrumentation for capture, upload, outbox, PDF, share, and auth refresh flows.
- Clear handling for native-only failures: microphone permission denial, SecureStore read failures, SQLite lock errors, filesystem write errors.
- Performance marks for capture-to-review latency, audio upload duration, and PDF generation wait time.

## 8. Verification Strategy

Per `docs/workflow/VERIFY.md` tiers, adapted for mobile:

- **Tier 1 (implementation loop):** Shared pure logic stays testable with Vitest/Jest. Native UI/hooks use React Native Testing Library + Jest. Run with `npm test`.
- **Tier 2 (post-review patch):** Rerun only tests covering patched areas.
- **Tier 3 (PR/final gate):** EAS Build preview; install on physical device; verify critical path: login → capture → extract → review → share.
- **Tier 4 (operator-only):** Physical-device checks required for audio, permissions, offline, PDF/share, and deep links.

**Critical integration tests (manual, Tier 4):**
1. Record 3 voice clips offline → go online → outbox syncs → quote appears.
2. Kill app mid-extraction → relaunch → extraction resumes or fails gracefully.
3. Background app during recording → audio stops safely, clip is saved.

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Backend audio format decode from `expo-audio` output | High | Backend already maps M4A/AAC to MP4 and normalizes to WAV via ffmpeg/pydub. Risk is actual Expo recorder output metadata and decode compatibility. Phase 0 spike validates this. |
| SQLite performance on large audio metadata | Medium | Store blobs on filesystem, only metadata in SQLite. |
| Auth token security in SecureStore | Medium | Use short-lived access tokens (15 min) + refresh tokens; SecureStore is keychain-backed. |
| iOS microphone permission denial | Medium | Graceful degradation to text-only capture; clear permission UI. |
| App Store rejection for "minimal functionality" | Medium | Ensure offline capture + PDF sharing provide clear value beyond the PWA. |
| Maintaining two frontends (web + native) | Medium | Extract shared business logic to a `packages/shared` workspace if monorepo'd. |

---

## 10. Open Questions

1. **Monorepo structure?** Do we move the native app into `apps/mobile/` alongside `frontend/` and `backend/`, or a separate repo?
2. **State management?** Stick with React Context + custom hooks, or introduce Zustand / Jotai for global state?
3. **Query caching?** Add React Query/TanStack Query for server state, or keep manual `fetch` + local state?
4. **Navigation library?** Expo Router (file-based) or React Navigation (imperative)? Expo Router is recommended for greenfield.
5. **Audio format contract?** Backend already accepts M4A/AAC (maps to MP4) and normalizes to WAV. Phase 0 must validate actual `expo-audio` iOS/Android output against `infer_audio_format()` and ffmpeg/pydub.

---

## 11. Success Criteria (Definition of Done)

- [ ] User can install the app from TestFlight / Play Internal Testing.
- [ ] Offline capture (voice + text) survives app restart and syncs on reconnection.
- [ ] Quote review, edit, PDF share, and email send match PWA functionality.
- [ ] Auth flow (login, register, forgot password, onboarding) is functional.
- [ ] App passes iOS/Android store review guidelines.
- [ ] Backend remains compatible with existing PWA without regressions.

---

## 12. Execution Mode

**Mode:** `gated`.

- One Spec issue controls the rewrite.
- Phase 0 is the first child Task and must complete before implementation Tasks.
- Child Tasks must stay PR-sized and close Task issues, not the Spec.
- Parallel execution is allowed only after Phase 0 decisions are locked, and only for disjoint UI surfaces (e.g., Customers & Settings can run parallel to Onboarding & Profile).
- Do not run parallel execution for auth, storage schema, outbox state-machine, or shared API-contract changes.

---

*End of Umbrella Spec*
