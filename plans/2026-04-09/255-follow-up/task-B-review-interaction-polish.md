## Task B: Review interaction polish — customer pulse + toast notifications

Two additive improvements: a declarative CSS ring-pulse on the unassigned customer row, and a shared
Toast component replacing inline notification paragraphs across ReviewScreen, SettingsScreen,
CustomerDetailScreen, and CaptureScreen. Settings and CustomerDetailScreen are explicitly in scope —
they share the identical save-success paragraph pattern and adding them now avoids stranded call
sites once Toast exists. CaptureScreen is in scope because its extraction errors live inside an
`h-dvh overflow-hidden` layout where an inline `FeedbackMessage` displaces panel content; a
persistent overlay Toast fixes the layout problem and gives a consistent dismissal pattern.

---

## Acceptance criteria

1. When `requires_customer_assignment` is true, the customer row button in `ReviewCustomerRow` has
   `ring-2 ring-warning-accent/60 animate-pulse [animation-iteration-count:3]` applied. These classes
   are absent when a customer is assigned.
2. No JavaScript timer, `useEffect`, or session state is used for the pulse — it is purely CSS-driven.
3. A new `Toast` component exists at `frontend/src/shared/components/Toast.tsx`.
4. `Toast` accepts `variant?: "success" | "error"` (default `"success"`) and
   `durationMs?: number | null` (default `2500`; `null` = persistent, manual dismiss only).
   Success variant: `bg-on-surface text-background`. Error variant: `bg-error-container border
   border-error/40 text-error`. Both render fixed bottom-center above the footer (`bottom-20`),
   `rounded-xl px-4 py-2.5 text-sm ghost-shadow`. Success Toast uses `role="status"`; error Toast
   uses `role="alert"`. The error variant renders a dismiss `×` button; the success variant does
   not.
5. `ReviewScreen` uses `<Toast>` for "Draft saved." — the `saveNotice` state and its prop threading
   into `ReviewFormContent` are removed.
6. `ReviewFormContent` no longer accepts or renders a `saveNotice` prop.
7. `SettingsScreen` uses `<Toast>` for "Saved" — the `saveSuccess` inline `<p role="status">` is
   removed.
8. `CustomerDetailScreen` uses `<Toast>` for its `saveSuccess` inline `<p role="status">` — that
   paragraph is removed.
9. `CaptureScreen` uses the persistent error Toast for both extraction/submission errors and
   recoverable voice-capture runtime errors. Dismissing the Toast clears the active error source:
   submission errors via `setError(null)` and voice-capture errors via `clearError()`.
10. `CaptureScreen` keeps the unsupported-browser warning inline; only action-result errors move to
   Toast.
11. In `CaptureScreen`, the Toast overlays the panel rather than displacing it.
12. `make frontend-verify` passes.

---

## Design notes

### Customer row pulse (S4)

Purely declarative — no state needed. Apply conditional classes directly on the row button:

```tsx
className={cn(
  "... existing row classes ...",
  requiresCustomerAssignment && "ring-2 ring-warning-accent/60 animate-pulse [animation-iteration-count:3]"
)}
```

Tailwind JIT handles arbitrary `[animation-iteration-count:3]` as an inline style utility.
The animation runs 3 cycles using Tailwind's default `animate-pulse` timing and stops automatically.
Re-entry after navigation will pulse again, which is a desirable re-prompt.

Test assertion: render with `requiresCustomerAssignment={true}` and assert the ring classes are
present; render with `requiresCustomerAssignment={false}` and assert they are absent.

### Toast component

Owner-controlled, no singleton or context. The owner holds `toastMessage` state and passes it in:

```tsx
interface ToastProps {
  message: string | null;       // null = hidden
  variant?: "success" | "error"; // default "success"
  onDismiss: () => void;
  durationMs?: number | null;   // null = persistent, manual dismiss only; default 2500
}
```

Position: `fixed bottom-20 left-1/2 -translate-x-1/2 z-50`. Use a `useEffect` inside Toast to
auto-call `onDismiss` after `durationMs` when `message` is non-null and `durationMs` is not null.
Set `role="status"` for success and `role="alert"` for error so the replacement preserves the
current live-region announcement semantics.

Error variant additionally renders a dismiss button (`×`, `aria-label="Dismiss"`) because it is
persistent. Success variant has no dismiss button — it auto-disappears.

Each screen holds its own `toastMessage` / `setToastMessage` state — no global toast state.

**CaptureScreen specifics:** Keep the unsupported-browser warning inline. Route the existing
`displayedError = error ?? voiceError` value to the Toast so both extraction/submission failures
and recoverable voice-capture runtime failures share the same overlay treatment. The Toast
`onDismiss` handler should clear the active source explicitly: `setError(null)` when `error` is
present, otherwise `clearError()` when `voiceError` is active. The inline
`<FeedbackMessage variant="error">` block inside the height-constrained section is removed
entirely.

---

## Files in scope

| File | Change |
|---|---|
| `frontend/src/shared/components/Toast.tsx` | New component — success + error variants, persistent mode |
| `frontend/src/features/quotes/components/ReviewCustomerRow.tsx` | Add conditional ring + pulse classes |
| `frontend/src/features/quotes/components/ReviewScreen.tsx` | Remove `saveNotice` state + prop; add success `<Toast>` |
| `frontend/src/features/quotes/components/ReviewFormContent.tsx` | Remove `saveNotice` from interface + JSX |
| `frontend/src/features/settings/components/SettingsScreen.tsx` | Remove `saveSuccess` paragraph; add success `<Toast>` |
| `frontend/src/features/customers/components/CustomerDetailScreen.tsx` | Remove `saveSuccess` paragraph; add success `<Toast>` |
| `frontend/src/features/quotes/components/CaptureScreen.tsx` | Remove inline `FeedbackMessage` error block; add persistent error `<Toast>` |
| `frontend/src/shared/components/Toast.test.tsx` (new) | render, success auto-dismiss, error persistent (no auto-dismiss when `durationMs={null}`), dismiss button present on error variant, live-region roles (`status`/`alert`) |
| `frontend/src/features/quotes/components/ReviewCustomerRow.test.tsx` (new) | Pulse classes present/absent per `requiresCustomerAssignment` |
| `frontend/src/features/settings/tests/SettingsScreen.test.tsx` | Assert success toast renders; `saveSuccess` paragraph gone |
| `frontend/src/features/customers/tests/CustomerDetailScreen.test.tsx` | Assert success toast renders; `saveSuccess` paragraph gone |
| `frontend/src/features/quotes/tests/CaptureScreen.test.tsx` | Assert persistent error toast renders on extraction failure and voice-capture runtime failure; dismiss clears the active error source; unsupported-browser warning stays inline |

---

## Do NOT change

- `FeedbackMessage` — stays for inline load errors, inline form/validation errors (load failures,
  sheet errors, inline form fields). Only action-result notifications (save success, extraction
  errors) move to Toast.
- `ConfirmModal`
- Any backend files
- Any pricing or footer components

---

## Verification

```bash
make frontend-verify
cd frontend && npx vitest run \
  src/shared/components/Toast.test.tsx \
  src/features/quotes/components/ReviewCustomerRow.test.tsx \
  src/features/quotes/tests/ReviewScreen.test.tsx \
  src/features/settings/tests/SettingsScreen.test.tsx \
  src/features/customers/tests/CustomerDetailScreen.test.tsx \
  src/features/quotes/tests/CaptureScreen.test.tsx
```
