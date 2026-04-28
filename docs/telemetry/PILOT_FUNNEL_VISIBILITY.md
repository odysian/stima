# Pilot Funnel Visibility (Founder)

This document defines the smallest useful founder visibility path for P1 using backend `event_logs` only.

## Run Safely

Use read-only DB credentials and run queries from:

- `docs/telemetry/pilot-funnel-queries.sql`

Example:

```bash
psql "$READ_ONLY_DATABASE_URL" -f docs/telemetry/pilot-funnel-queries.sql
```

## Query Coverage

The SQL file includes:

1. Daily event counts grouped by date + `event_name`.
2. Quote funnel counts:
   - `quote_started`
   - `draft_generated`
   - `draft_generation_failed`
   - `quote_shared`
   - `email_sent`
   - `quote_viewed`
   - `quote_approved`
   - `quote_marked_lost`
3. Invoice funnel counts:
   - `invoice_created`
   - `invoice_shared`
   - `email_sent`
   - `invoice_viewed`
   - `invoice_paid`
4. Extraction quality from `draft_generated` + `metadata_json.extraction_outcome`.
5. Daily email volume plus quote/invoice split when metadata includes `quote_id` / `invoice_id`.
6. Weekly active users (distinct `user_id` by week).
7. Recent failures (`draft_generation_failed`) for investigation.

## Known Limitations

- `email_sent` is generic; quote vs invoice split depends on metadata (`quote_id` / `invoice_id`) being present.
- Some operational/security failure events are stdout-only logs, not persisted to `event_logs`; this visibility path only covers persisted events.
- Funnel queries are event-count based (not strict user/session conversion rates).

## Privacy Guardrails

- Use aggregate counts and internal IDs only (`user_id`, `quote_id`, `invoice_id`, `customer_id`).
- Do not include raw notes, raw transcripts, raw audio content, customer messages, or contact details in founder query outputs by default.
- Do not join to customer contact tables unless there is a specific approved need.

