# Emergency Share-Token Revoke

Use this when a public quote or invoice link must be invalidated immediately.

## Preferred path

1. Identify the affected quote or invoice.
2. Revoke through the authenticated API:
   - `DELETE /api/quotes/{id}/share`
   - `DELETE /api/invoices/{id}/share`
3. Confirm public access now returns generic `404`.

## Expected system behavior

- External callers see the same generic `404` for unknown, expired, and revoked tokens.
- Internal structured logs retain the denied reason as `revoked`.
- A later share action can mint a fresh token without exposing the old one.

## Last-resort manual intervention

If the authenticated API path is unavailable, set `share_token_revoked_at` on the affected `documents` row and treat the follow-up share action as a controlled token rotation.

## Verification

- `GET /api/public/doc/{token}` returns `404`.
- `GET /share/{token}` returns `404`.
- Structured `public_share.token_denied` events do not include the raw token.

## Related runbooks

- [production-readiness-checklist.md](./production-readiness-checklist.md)
