# Refactor: extraction cancellation via AbortController

## Context

Task #63 introduced an `isMountedRef` guard to prevent `applyDraft` and
`navigate("/quotes/review")` from firing after a user leaves the CaptureScreen
mid-extraction. A Strict Mode bug in that implementation was caught and patched
(the setup body didn't reset `isMountedRef.current = true`, so the ref was
permanently `false` in development).

The guard works correctly now, but it ignores the result of a completed request
— it doesn't cancel the request itself. For extraction (LLM call + optional
audio transcription), that is wasted server compute and unnecessary spend.

## What the current code does

```
user leaves → navigate(-1) → component unmounts
                                        ↓
                          isMountedRef.current = false
                                        ↓
                     extraction response arrives (ignored)
                     applyDraft / navigate skipped
                     setExtractionStage(null) skipped (fine, unmounted)
```

The server processes the full request. The client discards the result silently.

## What AbortController would do

```
user leaves → navigate(-1) → component unmounts
                                        ↓
                          cleanup: controller.abort()
                                        ↓
                     fetch rejects with AbortError (fast)
                     server drops connection, stops processing early
                     catch block ignores AbortError, clears loading state
```

The request is cancelled at the transport layer. Server-side work in progress
may already be underway (LLM can't be un-called mid-stream), but the connection
drop signals the backend to stop and discard the response.

## Approach

### 1. `quoteService.extract` — accept a signal

```ts
extract(payload: ExtractPayload, signal?: AbortSignal): Promise<ExtractionResult>
```

Pass `signal` through to the underlying `fetch` call in `http.ts` (or directly
in the service). No changes to the API contract — signal is transport-only.

### 2. `CaptureScreen` — create and wire the controller

Replace `isMountedRef` with an `AbortController` ref:

```ts
const abortControllerRef = useRef<AbortController | null>(null);

useEffect(() => {
  return () => {
    abortControllerRef.current?.abort();
  };
}, []);
```

In `handleExtract`:

```ts
const controller = new AbortController();
abortControllerRef.current = controller;

try {
  const extraction = await quoteService.extract(
    { clips: ..., notes },
    controller.signal,
  );
  applyDraft(...);
  navigate("/quotes/review");
} catch (err) {
  if (err instanceof DOMException && err.name === "AbortError") return;
  setError(...);
} finally {
  setExtractionStage(null);
  abortControllerRef.current = null;
}
```

No mounted check needed. The `finally` block unconditionally clears the loading
state — safe because an aborted extraction means the component is unmounting
anyway, and a React state update on an unmounting component is a no-op in
React 18.

### 3. Remove `isMountedRef` entirely

The Strict Mode issue disappears with it. `AbortController` is native,
cancellation-safe, and doesn't require manual lifecycle tracking.

## Scope

- `frontend/src/features/quotes/services/quoteService.ts` — add `signal` param
- `frontend/src/shared/lib/http.ts` — forward `signal` to `fetch` options
- `frontend/src/features/quotes/components/CaptureScreen.tsx` — swap ref pattern
- `frontend/src/features/quotes/tests/CaptureScreen.test.tsx` — add abort test,
  remove/update isMountedRef test

## What to test

- Abort during extraction: unmount while in-flight → no draft set, no navigation,
  loading state cleared
- AbortError is not shown as a user-facing error message
- Normal extraction success path unchanged
- Normal extraction error path unchanged

## Out of scope

- Backend cancellation handling (connection drop is sufficient signal)
- AbortController for other service calls (customers, createQuote) — those are
  cheap and short-lived; not worth the complexity
