# Task: Slice 2 Fix Timezone-Accurate Quote Dates

Parent Spec: #90

## Goal

Fix quote-facing date rendering so users do not see "tomorrow" on the evening of the
current local business day. Store a business/user timezone, default it from the
browser when available, expose it in Settings, and use it when formatting quote dates
in both the app UI and the PDF template.

Parent references:
- ad hoc bug report on 2026-03-24: quote generated around `8:00 PM America/New_York`
  displayed the next calendar day
- current UTC formatting in:
  - `backend/app/templates/quote.html`
  - `frontend/src/shared/lib/formatters.ts`

---

## Problem Framing

### Goal

Make quote dates reflect the business user's local timezone rather than raw UTC date
boundaries, so a quote created in the evening does not appear to have been issued
"tomorrow."

### Non-goals

- No customer-specific timezone logic in this task
- No IP geolocation
- No location/address inference
- No scheduling/calendar feature work
- No historical "issued local date" snapshot on documents yet

### Constraints

- Keep timestamps stored in UTC in the database
- Add timezone only as a formatting/input concern for now
- Reuse the existing profile/settings/onboarding flow rather than inventing a new
  preferences surface

---

## Locked Design Decisions

### Store timezone on the user/business profile, not on the customer

For quote issue dates, the correct source of truth in V0 is the business user's
timezone, not the customer's address or timezone. A quote is being issued by the
contractor's business, so "Issued" should reflect the business day they were working
in.

Customer-specific timezone can be revisited later if the product adds service-date or
location-sensitive workflows. It is out of scope for this fix.

### Auto-detect from the browser, but keep it editable in Settings

Default timezone should come from the browser via:

```ts
Intl.DateTimeFormat().resolvedOptions().timeZone
```

That gives us a strong zero-friction default for most users. However, browser
detection is not enough on its own because users may:
- travel
- use a VPN
- work in a timezone different from their current device

So the detected value must be editable in Settings.

For V0, keep the UI intentionally small:
- use a `<select>` in Settings
- seed it with a curated list of common IANA zones plus `UTC`
- include at minimum:
  - `America/New_York`
  - `America/Chicago`
  - `America/Denver`
  - `America/Los_Angeles`
  - `UTC`

If pilot scope expands beyond the U.S., revisit this as a searchable combobox.

### Source timezone explicitly from profile reads in this task

Do not invent a new global profile context or shared profile hook as part of this fix.
For this task, thread timezone through the existing surfaces explicitly:
- `QuoteList.tsx` fetches profile alongside quotes and passes `profile.timezone` into
  `formatDate(...)`
- `CustomerDetailScreen.tsx` fetches profile alongside customer + quote-history data
  and passes `profile.timezone` to `QuoteHistoryList`
- `QuoteHistoryList.tsx` accepts `timezone?: string` as a prop

This keeps the fix small and avoids turning a date bug into a profile-state
architecture task.

### Use IANA timezone identifiers end-to-end

Store and format with identifiers like:
- `America/New_York`
- `America/Chicago`
- `America/Denver`
- `America/Los_Angeles`

Do not store raw offsets like `-05:00`, because offsets change with DST and are not
stable enough for recurring business behavior.

### Keep stored quote timestamps in UTC

`created_at` and `updated_at` remain UTC-backed timestamps. The change is in
presentation, not persistence semantics.

### Do not freeze issued local date in this task

This fix should format `created_at` using the user's saved timezone at render time.
That is the smallest viable fix.

Possible later follow-up:
- persist `issued_timezone` and/or `issued_local_date` on `documents` so old PDFs do
  not change visible day if a business later changes timezone

That follow-up is intentionally out of scope here to keep the fix PR-sized.

---

## Risks And Edge Cases

- Existing users will not have a stored timezone initially
- Browser timezone detection can fail or return an unsupported value
- Frontend display and backend PDF rendering must stay consistent
- Tests currently lock UTC rendering behavior and will need to be intentionally updated
- Users changing timezone later may alter visible dates for older quotes because this
  task does not freeze issued local date on the document

---

## Scope

### Backend

**Migration**
- Add `timezone VARCHAR(64) NULL` to `users`

**`backend/app/features/auth/models.py`**
- Add nullable `timezone` field to `User`

**`backend/app/features/profile/schemas.py`**
- Add `timezone` to `ProfileResponse`
- Add optional/required `timezone` handling to `ProfileUpdateRequest`
- Validate timezone with `zoneinfo.ZoneInfo(tz)` inside a `try/except`, rejecting
  unsupported IANA timezone identifiers without adding a third-party dependency

**`backend/app/features/profile/api.py`**
- Accept and return `timezone`

**`backend/app/features/profile/service.py`**
- Pass timezone through the update path

**`backend/app/features/profile/repository.py`**
- Persist `timezone`

**`backend/app/features/quotes/repository.py`**
- Include `timezone` plus preformatted `issued_date` / `updated_date` strings in the
  render context used for PDF generation
- Build those strings in Python using `zoneinfo.ZoneInfo`, not in the template

**`backend/app/integrations/pdf.py`**
- Keep the template dumb: render the preformatted date strings from the repository
  context rather than timezone-adjusting inside Jinja

**`backend/app/templates/quote.html`**
- Render preformatted `issued_date` / `updated_date` strings rather than calling
  `strftime(...)` on raw UTC datetimes

### Frontend

**`frontend/src/features/profile/types/profile.types.ts`**
- Add `timezone` to profile request/response types

**`frontend/src/features/profile/services/profileService.ts`**
- Send timezone on profile update

**`frontend/src/features/profile/components/OnboardingForm.tsx`**
- Detect browser timezone on submit or mount
- Include it in the onboarding profile update payload

**`frontend/src/features/settings/components/SettingsScreen.tsx`**
- Show/edit timezone in settings
- Pre-fill from profile
- Allow the user to save a timezone override
- Use a simple `<select>` with the curated V0 timezone list above; do not build a
  custom combobox in this task

**`frontend/src/shared/lib/formatters.ts`**
- Stop forcing `timeZone: "UTC"` for quote-facing date formatting
- Change `formatDate` to accept `timezone?: string`
- Keep `formatDate` pure: callers pass the timezone in explicitly
- When `timezone` is missing/null, fall back to UTC to preserve current zero-state
  behavior for existing users until they save a timezone

**Quote screens using dates**
- Ensure quote list / preview / any other quote-facing date displays use the business
  timezone instead of UTC
- Explicitly update:
  - `frontend/src/features/quotes/components/QuoteList.tsx`
  - `frontend/src/features/customers/components/QuoteHistoryList.tsx`
  - `frontend/src/features/customers/components/CustomerDetailScreen.tsx`

**`frontend/src/features/quotes/components/QuoteList.tsx`**
- Fetch `profileService.getProfile()` alongside `quoteService.listQuotes()` in the
  existing `useEffect`
- Store `profile.timezone` locally in screen state
- Pass that timezone explicitly to `formatDate(quote.created_at, timezone)`

**`frontend/src/features/customers/components/QuoteHistoryList.tsx`**
- Add `timezone?: string` to the props interface
- Use `formatDate(quote.created_at, timezone)` instead of the UTC-only signature

**`frontend/src/features/customers/components/CustomerDetailScreen.tsx`**
- Fetch `profileService.getProfile()` alongside customer + quote history data
- Store the returned timezone in local screen state
- Pass `timezone` through to `QuoteHistoryList`

### Tests

**Backend**
- Profile tests cover timezone read/write
- PDF template/render tests cover timezone conversion around UTC day boundaries

**Frontend**
- Profile/settings/onboarding tests cover timezone payload handling
- Date formatter tests cover IANA timezone rendering instead of UTC-only behavior
- Quote list tests update from "UTC-stable day" to "business-timezone day"
- Update `frontend/src/shared/tests/mocks/handlers.ts` so the shared `GET /api/profile`
  MSW response includes `timezone`

### Docs

**`docs/ARCHITECTURE.md`**
- Add `users.timezone`
- Update profile contract to include timezone

Potential doc note:
- mention that quote-facing dates are rendered in the saved business timezone

---

## Implementation Plan

1. Add `users.timezone` with backend model/schema/profile update support and IANA
   timezone validation.
2. Update onboarding + settings to send/store browser-detected timezone and allow
   the user to edit it.
3. Thread timezone into frontend date formatting and backend PDF rendering so both
   surfaces render the same local business day. Concretely:
   - `formatDate(isoString, timezone?)`
   - `QuoteList` sources timezone from `profileService.getProfile()`
   - `CustomerDetailScreen` sources timezone from `profileService.getProfile()` and
     passes it into `QuoteHistoryList`
   - `QuoteHistoryList` accepts `timezone?: string`
   - PDF render context provides preformatted date strings built with `zoneinfo`
4. Update tests and docs to lock the new non-UTC behavior, including the evening
   Eastern-time regression case.

---

## Acceptance Criteria

- [ ] `users` has a nullable `timezone` field storing IANA timezone identifiers
- [ ] `GET /api/profile` returns `timezone`
- [ ] `PATCH /api/profile` accepts and persists `timezone`
- [ ] Onboarding sends browser-detected timezone by default
- [ ] Settings renders the saved timezone and allows updating it
- [ ] Settings uses a simple timezone `<select>` with the curated V0 timezone list
- [ ] Quote list dates render using the saved business timezone instead of UTC
- [ ] Customer quote history dates render using the saved business timezone instead of UTC
- [ ] PDF "Issued" and "Updated" dates render using the saved business timezone instead of UTC
- [ ] A quote created at `2026-03-25T00:00:00Z` renders as `Mar 24, 2026` for
      `America/New_York`
- [ ] When `timezone` is null/missing, quote-facing dates fall back to UTC
- [ ] Invalid timezone values are rejected cleanly
- [ ] `make backend-verify` passes
- [ ] `make frontend-verify` passes

## DoD Gate

After setting a timezone like `America/New_York`, a contractor generating a quote in
the evening sees the correct local issue date in both the app and the PDF.

---

## Verification

```bash
make backend-verify
make frontend-verify
```

Fallback:

```bash
cd backend && ruff check . && mypy . && bandit -r app/ && pytest
cd ../frontend && npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build
```

---

## Suggested Issue Command

```bash
gh issue create --title "Task: fix timezone-accurate quote dates" --label "type:task,area:quotes,area:frontend,area:backend" --body-file plans/2026-03-24/task-fix-timezone-accurate-quote-dates.md
```
