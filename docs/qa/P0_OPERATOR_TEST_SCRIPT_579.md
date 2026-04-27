# Operator Test Script — Task #579 Mobile/PWA QA

**Date:** 2026-04-25  
**Production URL:** `https://stima.odysian.dev`  
*(Live deployment with latest code from this branch.)*  
**Branch:** `task-579-mobile-qa-pass`

---

## Pre-flight

1. Connect your phone to the **same Wi-Fi** as this dev machine.
2. Open `http://192.168.228.128:5173` in your mobile browser.
3. Sign in with a test account.
4. For PWA tests: use **Add to Home Screen** before starting scenarios.

---

## Scenario A — Notes-only offline capture

**Goal:** Notes survive refresh while offline and create exactly one draft when extracted.

**Steps:**
1. Sign in on mobile browser or PWA.
2. Tap **New Quote** (or navigate to Capture).
3. Turn on **Airplane Mode** (or disable Wi-Fi/mobile data).
4. Type notes in the capture textarea.
5. **Refresh the page** (pull-to-refresh or browser reload).
6. ✅ **Expect:** Notes text reappears exactly as typed.
7. Turn **network back on**.
8. Tap **Extract**.
9. ✅ **Expect:** Exactly one editable draft appears in the quote list.

**Record:**
- Device: All tests run on samsung SM-A35 android
- OS version: ________________
- Browser/PWA mode: ________________
- Pass / Fail: PASS
- Notes (if fail): ________________

---

## Scenario B — Audio offline capture

**Goal:** Audio clips and notes survive refresh/reopen.

**Steps:**
1. Sign in.
2. Go to Capture.
3. Record **two audio clips** (tap record, speak, stop — repeat).
4. Type some notes.
5. **Refresh the page** or close and reopen the browser/PWA.
6. ✅ **Expect:** Both clips and notes are still present.
7. Turn network on if not already.
8. Tap **Extract**.
9. ✅ **Expect:** Exactly one editable draft is created.

**Record:**
- Device: ________________
- OS version: ________________
- Browser/PWA mode: ________________
- Pass / Fail: PASS
- Notes (if fail): ________________

---

## Scenario C — Outbox retry

**Goal:** Failed extraction retries automatically when network returns and creates exactly one server draft.

**Steps:**
1. Sign in.
2. Go to Capture.
3. Type notes (or record clips).
4. Turn on **Airplane Mode**.
5. Tap **Extract**.
6. ✅ **Expect:** Capture queues; you see a pending/outbox indicator. Capture remains recoverable.
7. Keep the app in the **foreground**.
8. Turn **network back on**.
9. ✅ **Expect:** Automatic foreground sync triggers. Pending card updates or disappears.
10. Navigate to the quote list.
11. ✅ **Expect:** Exactly **one** server draft appears (not duplicates).

**Record:**
- Device: Samsung Android
- OS version: ________________
- Browser/PWA mode: PWA
- Pass / Fail: PASS
- Notes (if fail): ________________

---

## Scenario D — Cold offline installed PWA

**Goal:** Installed PWA opens from home screen while offline and shows pending captures.

**Steps:**
1. Sign in while **online**.
2. Create a local pending capture (add notes, do **not** extract yet).
3. **Close the PWA completely** (swipe away from app switcher).
4. Turn on **Airplane Mode**.
5. Tap the **PWA icon on the home screen**.
6. ✅ **Expect:** App shell opens (not a browser error page).
7. ✅ **Expect:** Pending capture is visible.
8. ✅ **Expect:** Server-backed actions (e.g., load remote quotes) are blocked or show clear offline state.
9. Turn **network back on**.
10. ✅ **Expect:** Auth re-verifies and sync works (pending capture can be extracted).

**Record:**
- Device: ________________
- OS version: ________________
- Browser/PWA mode: ________________
- Pass / Fail: PASS
- Notes: Upon network on, offline banner disappears, actually reloading the page by swiping down or changing tabs required to refetch from API. Should we surface a refresh prompt in a similar style to the new update prompt for the PWA? === AUTO REFRESH issue #614 resolved this issue.

---

## Scenario E — Auth expiry / reauth

**Goal:** Expired session does not delete local work; reauth resumes sync.

**Steps:**
1. Sign in.
2. Create a pending capture (notes or clips, do not extract).
3. **Invalidate the session** (options below):
   - **Option A (if backend access):** Restart backend dev server, or clear cookies/storage.
   - **Option B (simplest):** In browser settings, clear cookies/site data for `192.168.228.128:5173`, then reload.
   - **Option C:** Wait for token expiry (15 min default).
4. Trigger an action that hits the API (e.g., tap Extract, or pull-to-refresh quote list).
5. ✅ **Expect:** Local capture still visible. App prompts or routes to sign-in.
6. Sign in again with the same account.
7. ✅ **Expect:** Sync resumes. Exactly **one** draft is created from the pending capture.

**Record:**
- Device: ________________
- OS version: ________________
- Browser/PWA mode: PWA
- Pass / Fail: PASS
- Notes (if fail): ________________

---

## Scenario F — Delete safety

**Goal:** Delete requires confirmation and fully removes local data.

**Steps:**
1. Create a pending capture with notes and at least one audio clip.
2. Tap **Delete** (or trash icon).
3. ✅ **Expect:** Confirmation modal appears with clear warning text.
4. Tap **Cancel**.
5. ✅ **Expect:** Capture remains intact (notes + clips still present).
6. Tap **Delete** again.
7. Tap **Confirm** in the modal.
8. ✅ **Expect:** Capture disappears from the recovery list.
9. ✅ **Expect:** Audio clips are removed from local clip storage (if visible in a clips list, they should be gone).

**Record:**
- Device: ________________
- OS version: ________________
- Browser/PWA mode: ________________
- Pass / Fail: PASS
- Notes (if fail): ________________

---

## Scenario G — PWA update prompt placement

**Goal:** Update prompt never blocks core mobile controls.

**Steps:**
1. Trigger an update prompt. Options:
   - **Option A:** If dev build changes, reload PWA until `needRefresh` fires.
   - **Option B:** Use DevTools Application > Service Workers > "Update" to force a new SW.
   - **Option C:** Temporarily modify a source file and save to trigger HMR/rebuild.
2. Open the app on a **mobile viewport** (real device or DevTools device mode).
3. If testing installed PWA, open from home screen.
4. ✅ **Expect:** Update prompt appears but does **not** block:
   - Bottom navigation bar
   - New Quote FAB
   - Extract footer button
   - Pending capture action buttons
   - Modal buttons (e.g., Delete confirmation)
5. Try tapping each of the above while the prompt is visible.
6. ✅ **Expect:** All controls remain tappable.

**Record:**
- Device: ________________
- OS version: ________________
- Browser/PWA mode: ________________
- Pass / Fail: PASS
- Notes (if fail): ________________

---

## Scenario H — Mobile keyboard and footer

**Goal:** Keyboard does not permanently obscure critical actions.

**Steps:**
1. Open Capture on **mobile**.
2. Tap the **notes textarea** to focus it.
3. Type **multi-line notes** (3–5 lines).
4. ✅ **Expect:** Footer / Extract controls either:
   - Remain visible above the keyboard, **or**
   - Are temporarily pushed up but recover/become usable after keyboard dismiss (tap outside or scroll).
5. Tap **Extract** (or the primary action button) after typing.
6. ✅ **Expect:** No critical action is permanently obscured by the keyboard.
7. Try rotating the device (portrait ↔ landscape) while keyboard is open.
8. ✅ **Expect:** Layout adjusts; controls remain reachable.

**Record:**
- Device: ________________
- OS version: ________________
- Browser/PWA mode: ________________
- Pass / Fail: PASS
- Notes (if fail): ________________

---

## Quick Reference

| Surface | URL to use |
|---|---|
| Mobile browser (web) | `https://stima.odysian.dev` |
| Installed PWA | Home screen icon (add via browser menu first) |

| Action | How to trigger offline |
|---|---|
| Airplane Mode | iOS/Android Control Center |
| Wi-Fi only | Disable Wi-Fi; keep mobile data on if testing mixed state |
| Force offline in DevTools | Chrome DevTools > Network > Offline |

| If something fails | Capture |
|---|---|
| Screenshot | OS screenshot (volume + power) |
| Screen recording | iOS: Control Center screen record; Android: Power menu screen record |
| Exact steps | What you tapped, in what order, and what you saw |
