# Follow-up: Log pilot events in the async extraction worker path

## What

`draft_generated` and `draft_generation_failed` pilot events are not emitted for async extraction jobs.

The sync path calls `extract_combined()` in `backend/app/features/quotes/extraction_service.py`, which logs both events. The async path bypasses `extract_combined()` — the API calls `prepare_combined_transcript()` (which logs `quote_started` and `audio_uploaded`) and the worker calls `extraction_integration.extract()` directly. Neither step logs `draft_generated` or `draft_generation_failed`.

## Impact

Pilot analytics will undercount extraction completions and failures for any user on the async path. The funnel from `quote_started` to `draft_generated` will appear broken once ARQ is live in production.

## Suggested fix

In `backend/app/worker/job_registry.py`, add `log_event` calls inside `_extract_quote_data` and `_store_extraction_result` (or in the `on_success` / error branches of `extraction_job`) to emit `draft_generated` on success and `draft_generation_failed` on terminal failure. The `user_id` is available on the `JobRecord`, so it can be fetched alongside the result write in `_store_extraction_result`.

## Source

Flagged in PR #245 review (task-205-async-extraction-jobs). Low severity — observability gap, not a correctness or contract issue.

## Not a blocker for

PR #245 merge. Can be picked up as a standalone instrumentation task.
