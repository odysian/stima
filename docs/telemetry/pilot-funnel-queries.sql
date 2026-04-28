-- Pilot funnel visibility queries for founder read-only use.
-- Safe-by-default: aggregate counts + IDs only, no raw customer content fields.

-- 1) Daily event counts (UTC day x event_name)
SELECT
  date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS event_date_utc,
  event_name,
  COUNT(*) AS event_count
FROM event_logs
GROUP BY event_date_utc, event_name
ORDER BY event_date_utc DESC, event_name ASC;

-- 2) Quote funnel counts (all-time)
SELECT
  SUM(CASE WHEN event_name = 'quote_started' THEN 1 ELSE 0 END) AS quote_started_count,
  SUM(CASE WHEN event_name = 'draft_generated' THEN 1 ELSE 0 END) AS draft_generated_count,
  SUM(CASE WHEN event_name = 'draft_generation_failed' THEN 1 ELSE 0 END) AS draft_generation_failed_count,
  SUM(CASE WHEN event_name = 'quote_shared' THEN 1 ELSE 0 END) AS quote_shared_count,
  SUM(CASE WHEN event_name = 'email_sent' THEN 1 ELSE 0 END) AS email_sent_total_count,
  SUM(CASE WHEN event_name = 'quote_viewed' THEN 1 ELSE 0 END) AS quote_viewed_count,
  SUM(CASE WHEN event_name = 'quote_approved' THEN 1 ELSE 0 END) AS quote_approved_count,
  SUM(CASE WHEN event_name = 'quote_marked_lost' THEN 1 ELSE 0 END) AS quote_marked_lost_count
FROM event_logs
WHERE event_name IN (
  'quote_started',
  'draft_generated',
  'draft_generation_failed',
  'quote_shared',
  'email_sent',
  'quote_viewed',
  'quote_approved',
  'quote_marked_lost'
);

-- 3) Invoice funnel counts (all-time)
SELECT
  SUM(CASE WHEN event_name = 'invoice_created' THEN 1 ELSE 0 END) AS invoice_created_count,
  SUM(CASE WHEN event_name = 'invoice_shared' THEN 1 ELSE 0 END) AS invoice_shared_count,
  SUM(CASE WHEN event_name = 'email_sent' THEN 1 ELSE 0 END) AS email_sent_total_count,
  SUM(CASE WHEN event_name = 'invoice_viewed' THEN 1 ELSE 0 END) AS invoice_viewed_count,
  SUM(CASE WHEN event_name = 'invoice_paid' THEN 1 ELSE 0 END) AS invoice_paid_count
FROM event_logs
WHERE event_name IN (
  'invoice_created',
  'invoice_shared',
  'email_sent',
  'invoice_viewed',
  'invoice_paid'
);

-- 4) Extraction quality (draft_generated outcome quality, all-time)
SELECT
  COUNT(*) FILTER (
    WHERE event_name = 'draft_generated'
  ) AS draft_generated_total,
  COUNT(*) FILTER (
    WHERE event_name = 'draft_generated'
      AND metadata_json ->> 'extraction_outcome' = 'degraded'
  ) AS draft_generated_degraded,
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE event_name = 'draft_generated'
        AND metadata_json ->> 'extraction_outcome' = 'degraded'
    ) / NULLIF(
      COUNT(*) FILTER (WHERE event_name = 'draft_generated'),
      0
    ),
    2
  ) AS degraded_pct
FROM event_logs;

-- 5) Daily email volume with quote/invoice split when metadata supports it
SELECT
  date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS event_date_utc,
  COUNT(*) FILTER (
    WHERE event_name = 'email_sent'
  ) AS email_sent_total,
  COUNT(*) FILTER (
    WHERE event_name = 'email_sent'
      AND metadata_json ? 'quote_id'
  ) AS email_sent_quote,
  COUNT(*) FILTER (
    WHERE event_name = 'email_sent'
      AND metadata_json ? 'invoice_id'
  ) AS email_sent_invoice,
  COUNT(*) FILTER (
    WHERE event_name = 'email_sent'
      AND NOT (metadata_json ? 'quote_id')
      AND NOT (metadata_json ? 'invoice_id')
  ) AS email_sent_unclassified
FROM event_logs
GROUP BY event_date_utc
ORDER BY event_date_utc DESC;

-- 6) Weekly active users (WAU)
SELECT
  date_trunc('week', created_at AT TIME ZONE 'UTC')::date AS week_start_utc,
  COUNT(DISTINCT user_id) AS weekly_active_users
FROM event_logs
GROUP BY week_start_utc
ORDER BY week_start_utc DESC;

-- 7) Recent persisted failures for triage
SELECT
  created_at,
  user_id,
  event_name,
  metadata_json
FROM event_logs
WHERE event_name = 'draft_generation_failed'
ORDER BY created_at DESC
LIMIT 100;
