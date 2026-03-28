# Plan: Milestone 4 — Reminder Workflow

**Date:** 2026-03-27
**Roadmap ref:** `docs/V1_ROADMAP.md` — Milestone 4
**Mode:** single (one task, one PR)
**Depends on:** M1 (status expansion), M3 (email delivery)

---

## Goal

Surface a contextual reminder banner on quotes idle in `shared` or `viewed` for 3+ days, with a one-click email resend using a follow-up subject line.

---

## Non-Goals

- Push notifications or background cron jobs (V2)
- Automatic email sends (the reminder is a prompt, not an auto-action)
- `expired` status or automatic status transitions
- Email open/delivery tracking
- Reminder for `approved` or `declined` quotes (they have outcomes — nothing to follow up on)
- Reminder configuration or threshold customization by the contractor
- "Mark as Lost" action (already ships in M1; M4 only surfaces it contextually in the banner)

---

## Current State Audit

### Quote detail screen
`QuotePreview.tsx` — loads quote data on mount, displays card with status badge and actions. No time-based conditional rendering exists today.

### Status timestamps
`documents.shared_at` — set when quote is first shared. `documents.updated_at` — server-managed, updates on any column change. Both are timestamptz.

**Idle detection logic needs:** `shared_at` (when the quote was first sent) or `updated_at` (last activity). The 3-day idle threshold should be measured from the later of:
- `shared_at` (for `shared` quotes that were never viewed)
- `updated_at` (for `viewed` quotes where the last activity was the view transition)

Using `updated_at` as the idle anchor works for both cases because:
- When a quote is shared, `updated_at` is set
- When a quote transitions to `viewed`, `updated_at` is set
- 3 days after the latest activity = idle

### Email delivery
After M3, `POST /api/quotes/{id}/send-email` sends the quote email. The resend action reuses this endpoint with a different subject line.

### Event-based rate limiting
M3 introduces a 5-minute rate limit on `send-email`. M4 needs a separate 24-hour rate limit for resends to prevent daily spam.

---

## Schema Changes

None.

**Considered and rejected:** A `last_emailed_at` column on `documents` would make rate limiting simpler, but the event log query approach from M3 is sufficient and avoids schema churn.

---

## Backend Changes

### 1. Resend subject line support

The M3 `send_quote_email()` method needs to support a `is_followup: bool` parameter that changes the email subject and optionally adds a brief follow-up wrapper to the body.

**Subject:**
- Normal: `"Quote for {title}"` or `"Quote {doc_number} from {business_name}"`
- Follow-up: `"Following up: Quote for {title}"` or `"Following up: {doc_number} from {business_name}"`

**Body:** Same email template. Optionally add a brief line above the main content: "Just following up on this quote. Let me know if you have any questions." — or keep the body identical and let the subject do the work.

**Decision for human review:** Should the follow-up email have a different body, or just a different subject? **Recommendation:** Different subject only. Keeps implementation simple, and the customer sees all the same info. A custom follow-up message is a V2 feature.

### 2. Resend rate limiting (24h)

The `send_quote_email()` method's existing rate limit (5 min) is the general anti-duplicate guard. For the reminder resend flow, add a stricter 24h check:

**Option A:** Add an `is_resend: bool` param to `send_quote_email()` that uses 24h rate limit instead of 5 min.
**Option B:** The API route `POST /api/quotes/{id}/resend-email` applies the 24h check before calling `send_quote_email()`.

**Recommendation:** Option B — new route with its own rate limit. Cleaner separation.

### 3. New API route: `POST /api/quotes/{id}/resend-email`

Authenticated, CSRF-protected. No request body.

**Logic:**
1. Same as `send-email` but:
   - Checks 24h rate limit (query `event_logs` for `email_sent` events for this quote in last 24h)
   - Uses follow-up subject line
   - Only allowed for `shared` or `viewed` quotes (not `ready` — must have been sent before)

**Responses:**
- `200` with updated quote on success
- `404` if quote not found
- `409` if quote is not in `shared` or `viewed` status
- `422` if customer has no email
- `429` if email resent within last 24h
- `502` if SendGrid fails

**Alternative (flag for human review):** Instead of a separate route, add a `followup=true` query parameter to the existing `send-email` route. Pro: fewer routes. Con: the rate limit logic differs, and the intent is semantically different. **Recommendation:** Separate route. Clean semantics.

### 4. Idle detection query

No new backend endpoint needed for idle detection. The frontend already has `updated_at` and `shared_at` from `QuoteDetailResponse`. The 3-day threshold can be computed client-side:

```typescript
const isIdle = quote.status === "shared" || quote.status === "viewed"
  ? Date.now() - new Date(quote.updated_at).getTime() > 3 * 24 * 60 * 60 * 1000
  : false;
```

This is purely a display concern — the backend doesn't need to know about the reminder.

**Decision for human review:** Should idle detection be backend-computed (a `is_idle` boolean in the quote response) or frontend-computed? **Recommendation:** Frontend-computed. It's a simple date comparison, avoids an API contract change, and keeps the concern in the presentation layer where it belongs.

---

## Frontend Changes

### 1. Reminder banner component

New component: `QuoteIdleBanner` (or inline in `QuotePreview.tsx` if small enough).

**Render condition:**
- Quote status is `shared` or `viewed`
- `updated_at` is more than 3 days ago

**Layout:**

```
┌──────────────────────────────────────────┐
│ ⏰  This quote hasn't had activity       │
│     in {N} days.                         │
│                                          │
│  [Resend Email]        [Mark as Lost]    │
└──────────────────────────────────────────┘
```

**Styling:**
- `rounded-xl border-l-4 border-warning-accent bg-warning-container p-4`
- Similar to `AIConfidenceBanner` but with action buttons
- Icon: `schedule` (Material Symbols, outlined)
- Text: `text-sm text-on-surface-variant`
- "Resend Email" button: secondary/outlined
- "Mark as Lost" button: ghost/text with destructive color — clicking triggers the same confirm modal from M1

**Dynamic text:**
- "3 days" / "5 days" / "1 week" / "2 weeks" — show human-readable relative time since last activity

### 2. QuotePreview integration

Add the `QuoteIdleBanner` above the `QuoteDetailsCard` when idle conditions are met. The banner sits between the status header area and the quote content.

```
ScreenHeader
┌──────────────┐
│ QuoteIdleBanner (conditional)
├──────────────┤
│ QuoteDetailsCard
├──────────────┤
│ QuotePreviewActions
└──────────────┘
```

### 3. Resend email handler

New handler in `QuotePreview.tsx`:

```typescript
const onResendEmail = async () => {
  try {
    setIsResending(true);
    const updated = await quoteService.resendQuoteEmail(quote.id);
    setQuote(updated);
    setResendMessage("Follow-up email sent");
  } catch (err) {
    // Handle 429 (rate limit), 422 (no email), 502 (send failure)
  } finally {
    setIsResending(false);
  }
};
```

### 4. Quote service addition

```typescript
export async function resendQuoteEmail(id: string): Promise<QuoteDetail> {
  return request(`/api/quotes/${id}/resend-email`, { method: "POST" });
}
```

### 5. Mark as Lost in banner context

The "Mark as Lost" button in the banner reuses the same handler from `QuotePreviewActions` (M1). It should trigger the confirm modal and call `POST /api/quotes/{id}/mark-lost`.

This means the `QuoteIdleBanner` needs the `onMarkLost` callback passed down from `QuotePreview`. The banner doesn't own the mutation — it delegates.

### 6. Banner dismissal

The banner disappears automatically when:
- The quote status changes (Mark as Won, Mark as Lost, or a resend that triggers a re-fetch)
- The page is refreshed and the idle condition no longer applies (shouldn't happen since resend doesn't change status)

No manual "dismiss" button — the banner represents a real state, not a notification.

---

## Key Risks and Edge Cases

| Risk | Mitigation |
|---|---|
| Timezone mismatch in idle detection | Use UTC timestamps consistently. `updated_at` is stored as timestamptz. Frontend `new Date()` parses UTC correctly |
| Banner flickers on page load | Only show banner after quote data is loaded (guard on `!isLoadingQuote`) |
| Resend rate limit confusion | Clear error message: "You can resend once every 24 hours. Last sent: {time}." |
| Customer receives many follow-ups | 24h rate limit per quote. Contractor controls when to send |
| "Mark as Lost" in banner vs. in actions panel — duplicate affordance | Both exist but serve different contexts. Banner is contextual (only appears after 3 days). Actions panel is always available on `shared`/`viewed`. This is intentional — the banner makes the action discoverable |
| `updated_at` changes for non-status reasons (future edits?) | Currently, `shared`/`viewed` quotes can't be edited (M1 guard). So `updated_at` only changes on status transitions. Safe |
| Banner shows on a `shared` quote that was just shared 3 days ago but the contractor is actively working on it | The contractor can ignore the banner. It's informational, not blocking. No auto-actions |

---

## Implementation Order

1. Backend: add `is_followup` subject line support to email template/service
2. Backend: add `POST /api/quotes/{id}/resend-email` route with 24h rate limit
3. Backend tests: resend route (happy path, 24h rate limit, status guard, follow-up subject)
4. Frontend: add `resendQuoteEmail()` to `quoteService.ts`
5. Frontend: build `QuoteIdleBanner` component (styling, relative time text, action buttons)
6. Frontend: integrate banner into `QuotePreview.tsx` (idle condition, handlers)
7. Frontend: wire "Resend Email" button to `onResendEmail` handler
8. Frontend: wire "Mark as Lost" button to existing `onMarkLost` handler from M1
9. Frontend tests: banner renders after 3 days, doesn't render before, rate limit error display
10. Update `docs/ARCHITECTURE.md`: add `resend-email` endpoint

---

## Acceptance Criteria

- [ ] Quotes in `shared` or `viewed` for 3+ days show the idle reminder banner on the detail screen
- [ ] Banner displays human-readable time since last activity ("5 days", "1 week")
- [ ] "Resend Email" button sends a follow-up email with "Following up:" subject prefix
- [ ] Resend is rate-limited to once per 24 hours per quote
- [ ] Rate limit violation shows a clear error message with timing info
- [ ] "Mark as Lost" button in banner triggers the same confirm modal as the actions panel
- [ ] Banner does not render for `draft`, `ready`, `approved`, or `declined` quotes
- [ ] Banner does not render for `shared`/`viewed` quotes less than 3 days old
- [ ] Resend does not regress quote status (a `viewed` quote stays `viewed` after resend)
- [ ] `email_sent` event is logged for resends
- [ ] Banner disappears after the quote receives an outcome
- [ ] `docs/ARCHITECTURE.md` updated with `resend-email` endpoint

---

## Verification

```bash
make backend-verify
make frontend-verify
```

Manual:
1. Share a quote → wait 3+ days (or manipulate `updated_at` in DB for testing) → open quote detail → confirm banner appears
2. Press "Resend Email" → confirm follow-up email arrives with "Following up:" subject
3. Press "Resend Email" again → confirm 429 rate limit message
4. Press "Mark as Lost" in banner → confirm modal → confirm → status changes to `declined`, banner disappears
5. Open a freshly shared quote (< 3 days) → confirm no banner
6. Open an `approved` quote → confirm no banner
