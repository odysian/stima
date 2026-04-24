# Spec 0 — Performance Baseline & Instrumentation

Date: 2026-04-24
Scope: frontend — capture flow timing instrumentation + bundle audit

---

## Goal

Make Stima's key user flows measurable before large offline/PWA changes land, so regressions are visible during PR review and offline work is not merged blindly without before/after timings.

## Why now

P0 offline work (IndexedDB, outbox, PWA shell) will touch CaptureScreen, useVoiceCapture, draft persistence, and the extraction path. Without baseline marks, there is no way to know whether a PR regresses tap-to-record latency or capture route load time.

---

## Scope

### 1. Timing utility

New file: `frontend/src/shared/perf.ts`

Exports:
- `perfMark(name: string): void` — wraps `performance.mark(name)`; no-op on error
- `perfMeasure(name: string, startMark: string, endMark?: string): number` — wraps `performance.measure`, returns duration in ms, logs to `console.debug` in dev only, no-op on error (returns 0)

```ts
const DEV = import.meta.env.DEV;

export function perfMark(name: string): void {
  try { performance.mark(name); } catch { /* ignore */ }
}

export function perfMeasure(name: string, startMark: string, endMark?: string): number {
  try {
    const entry = endMark
      ? performance.measure(name, startMark, endMark)
      : performance.measure(name, startMark);
    if (DEV) console.debug(`[perf] ${name}: ${entry.duration.toFixed(1)}ms`);
    return entry.duration;
  } catch { return 0; }
}
```

### 2. Capture route load

File: `frontend/src/features/quotes/components/CaptureScreen.tsx`

In the mount `useEffect` (the one that sets `isMountedRef.current = true`), add after the mount flag:

```ts
perfMark("capture:route:mounted");
perfMeasure("capture:route:load_ms", "navigationStart", "capture:route:mounted");
```

> **Note (React Strict Mode):** In development, React Strict Mode runs effects twice, producing two `capture:route:mounted` marks and two `capture:route:load_ms` entries. This is expected and harmless — production builds see exactly one entry. If single-entry dev behavior is required, guard with a `useRef` flag.

### 3. Tap-to-record

File: `frontend/src/features/quotes/hooks/useVoiceCapture.ts`

In `startRecording` (line 127):
- Add `perfMark("capture:record:tap")` after both guard checks (after the `if (isRecording) { return; }` at line 135), before `setError(null)`. Placing after guards ensures the mark only fires when a legitimate recording will proceed; paired end marks are always created, so measures are never dangling.
- Add `perfMark("capture:record:stream_ready")` after `streamRef.current = stream` (line 142) and before `resolvePreferredMimeType()` (line 144).
- Add `perfMark("capture:record:active")` immediately after `recorder.start()` (line 201).
- Add one measure call after `capture:record:active`:

```ts
perfMeasure("capture:record:tap_to_stream_ms", "capture:record:tap", "capture:record:stream_ready");
perfMeasure("capture:record:tap_to_active_ms", "capture:record:tap", "capture:record:active");
```

### 4. Extract submit and response

File: `frontend/src/features/quotes/components/CaptureScreen.tsx`

In `onExtract()` (line 153):
- Add `perfMark("capture:extract:start")` after the validation guards (after the `totalClipBytes` guard at line 170), before `clearExtractionStageTimers()`. Placing after guards means the mark only fires when extraction actually submits; no dangling mark on validation failure.
- Add `perfMark("capture:extract:response")` immediately after `quoteService.extract(...)` resolves (after line 192, before the `isMountedRef` check at line 193).
- Add measure:

```ts
perfMeasure("capture:extract:submit_to_response_ms", "capture:extract:start", "capture:extract:response");
```

### 5. Draft hydration

File: `frontend/src/features/quotes/components/CaptureScreen.tsx`

In `hydrateFromPersistedQuote()` (line 141):
- Add `perfMark("capture:draft:hydrate_start")` at entry.
- Add `perfMark("capture:draft:ready")` after `applyDraftFromQuoteDetail(...)` returns (line 146).
- Add measure:

```ts
perfMeasure("capture:draft:hydrate_ms", "capture:draft:hydrate_start", "capture:draft:ready");
```

### 6. Local save placeholder

Add a `// TODO(spec1): perfMark("capture:local:save_start") / perfMark("capture:local:save_done")` comment at the top of `onExtract()` noting where the IndexedDB save mark belongs once Spec 1 lands. Do not add live marks for a code path that does not exist yet.

### 7. Bundle audit (one-time)

Run `npx vite build 2>&1 | grep "kB"` from `frontend/` and record the gzip sizes of the main chunks in this spec under **Current bundle baseline** below.

Note the App.tsx eager-import pattern as a route-splitting candidate. Do not implement code splitting in this spec — that belongs to a separate task if the baseline warrants it.

Add `rollup-plugin-visualizer` to `frontend/package.json` devDependencies and wire it into `vite.config.ts` behind `process.env.ANALYZE === "true"`:

```ts
import { visualizer } from "rollup-plugin-visualizer";

plugins: [
  react(),
  tailwindcss(),
  process.env.ANALYZE === "true" && visualizer({ open: true, gzipSize: true }),
].filter(Boolean),
```

---

## Current bundle baseline

Measured on 2026-04-24 via `cd frontend && npx vite build`:

- `dist/assets/index-w5JgiP1a.js`: `570.28 kB` (gzip `167.07 kB`)
- `dist/assets/index-Z-2kqtAX.css`: `59.34 kB` (gzip `10.36 kB`)
- `dist/index.html`: `1.95 kB` (gzip `0.75 kB`)

Route-splitting candidate noted:

- `frontend/src/App.tsx` currently eager-imports many route screens into the main bundle; defer code splitting to a follow-up task (out of scope for Spec 0).

---

## Non-goals

- Remote analytics or telemetry pipeline (marks are dev-only console output for now)
- Route code splitting (note the opportunity, do not implement)
- Backend timing or server-side instrumentation
- Service worker / PWA performance
- IndexedDB save timing (placeholder comment only; live mark lands with Spec 1)
- Audio clip save timing (lands with Spec 3)
- Performance regression CI gate (future work)

---

## Acceptance criteria

- `perfMark` and `perfMeasure` are importable from `@/shared/perf`.
- Running `npm run dev` (local dev server, where `import.meta.env.DEV` is `true`), `console.debug` entries appear for each measure when the corresponding flow runs.
- `performance.getEntriesByType("measure")` in the browser console returns entries for:
  - `capture:route:load_ms`
  - `capture:record:tap_to_stream_ms`
  - `capture:record:tap_to_active_ms`
  - `capture:extract:submit_to_response_ms`
  - `capture:draft:hydrate_ms`
- `capture:route:load_ms` is under 1000ms on local dev (warm).
- `capture:record:tap_to_active_ms` is under 500ms on local dev (warm, mic already granted).
- Bundle baseline is recorded in this spec before the PR merges.
- `ANALYZE=true npx vite build` opens the visualizer without error.
- No marks are added for code paths that do not yet exist (IndexedDB, local save).
- Frontend tests (`make frontend-verify`) pass unchanged — marks are side-effect-free.

---

## Verification

**Tier 1 (during implementation)**
- `cd frontend && npx tsc --noEmit` — no new type errors.
- Open the app locally, navigate to Capture, tap record, submit an extraction. Inspect `performance.getEntriesByType("measure")` in browser devtools and confirm all five measures appear with plausible values.
- Confirm `console.debug` log lines appear in dev mode.

**Tier 2 (PR gate)**
- `make frontend-verify` passes.
- `ANALYZE=true npx vite build` opens the bundle visualizer without error.
- Bundle baseline numbers recorded in this spec.

---

## Target metrics (for future regression reference)

From the roadmap — to validate against in later PRs, not enforced by this spec:

| Metric | Target |
|---|---|
| Tap-to-record visible state (warm) | < 150ms |
| Local note save (p95) | < 50ms (lands with Spec 1) |
| Local clip save after stop (p95) | < 200ms (lands with Spec 3) |
| Reopen local capture/draft (p95) | < 400ms (lands with Spec 1) |
| Capture route interactive (p75 mid-range mobile) | < 2000ms |
