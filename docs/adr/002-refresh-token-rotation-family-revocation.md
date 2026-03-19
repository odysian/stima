# ADR-002: Refresh Token Rotation with Family Revocation

**Date:** 2026-03-18
**Status:** Accepted
**Spec/Task:** #1 (Spec: Auth Foundation), #3 (Task 2: Backend Auth API)

---

## Context

ADR-001 established that refresh tokens are stored in the database as SHA-256 hashes with a `revoked_at` soft-revoke column, to support explicit logout and replay protection. That decision ruled out stateless JWTs for refresh tokens precisely because stateless tokens cannot be revoked before expiry.

This ADR narrows in on the rotation strategy — what happens to the consumed token, what happens on replay, and how multi-device sessions are handled.

The threat model driving this decision:

- **Token theft**: a refresh token is intercepted (network, compromised client, log exposure). The attacker uses it to silently maintain access beyond the victim's session lifetime.
- **Replay after rotation**: a legitimate user refreshes; the old token is now consumed. The same old token is later replayed — either by an attacker who captured it or by a buggy client that retried a failed request.
- **Multi-device sessions**: a user operates Stima across multiple devices simultaneously. Revoking all sessions to handle a replay must be a deliberate security response, not the default behavior of a single legitimate refresh.

The constraints:

- Refresh tokens are 30-day opaque JWTs signed with `HS256`. Each token carries a `jti` (UUID v4) claim to ensure uniqueness even if `sub` and `exp` collide.
- The raw token value is never persisted. Only its SHA-256 hex digest is stored in `refresh_tokens.token_hash`.
- The rotation operation must be atomic to prevent race conditions on concurrent refresh calls.

---

## Options Considered

### Option A: Simple rotation — no family revocation

On every `/refresh` call, the consumed token is soft-revoked and a new token is issued. Replay of a consumed token returns `401`. No further action is taken — the new token (issued in the original, legitimate refresh) remains valid.

**Pros:**
- Simple to implement and reason about.
- A replayed consumed token fails immediately — the attacker gains nothing if the legitimate rotation already occurred.

**Cons:**
- Does not detect theft. If an attacker obtains the original token and races to refresh before the legitimate client does, they get a valid new token. At that point, the legitimate client's next refresh attempt (using the now-consumed original token) returns `401` — but there is no automatic revocation of the attacker's session.
- The victim's session silently disappears without any account-wide protective response.
- Provides no signal that a stolen token was replayed; all `401` outcomes look the same.

### Option B: Rotation with family revocation on replay (chosen)

On every `/refresh`, the consumed token is soft-revoked and a replacement is issued atomically via `SELECT ... FOR UPDATE`. If the consumed token is already revoked (`revoked_at IS NOT NULL`), a replay is inferred and `revoke_all_user_tokens` is called before returning `401`.

In the normal path the sequence is:

1. Lock the consumed token row.
2. Validate: not already revoked, not expired, `user_id` matches JWT `sub`, user is active.
3. Set `revoked_at = now` on the consumed row.
4. Insert a new `RefreshToken` row with a fresh hash and expiry.
5. Commit atomically. Return the new session.

In the replay path (consumed token already has `revoked_at IS NOT NULL`):

1. Call `revoke_all_user_tokens(user_id=consumed_token.user_id)` — bulk-update all rows with `revoked_at IS NULL` for that user.
2. Return `401`. All active sessions across all devices are now terminated.

**Pros:**
- Detects replay of a consumed token and treats it as an indicator of theft.
- Provides an automatic protective response: all sessions are terminated, forcing re-authentication across all devices.
- The `SELECT ... FOR UPDATE` prevents TOCTOU races on concurrent refresh attempts with the same token.
- Maintains an audit trail: every consumed token row retains its `revoked_at` timestamp; the replay event can be reconstructed from DB state.

**Cons:**
- Family revocation is a blunt instrument: a network hiccup or buggy client that retries a refresh with the same old token would trigger full session termination, even without an actual attacker.
- Adds a branch in the rotation path that issues a bulk `UPDATE` before returning `401`, slightly increasing per-request DB cost on the error path.

### Option C: Token binding to device fingerprint

Bind each refresh token to a device fingerprint (user-agent string, IP address, or a client-generated nonce). On refresh, the incoming fingerprint must match the one stored with the token. Mismatches are rejected.

**Pros:**
- A stolen token used from a different network/device is rejected at the binding check, before family revocation is needed.

**Cons:**
- User-agent and IP are unstable identifiers: mobile clients roam between networks; browsers update; VPN exits change. Legitimate refreshes would fail unpredictably.
- A client-generated nonce stored in `localStorage` has the same XSS exposure as localStorage-stored tokens and defeats the purpose of httpOnly cookies.
- Significantly more implementation complexity for minimal additional protection given the other controls already in place (httpOnly cookies, short access token TTL, rate limiting).

---

## Decision

**Rotation with family revocation on replay (Option B).**

The retry-triggers-revocation trade-off is acceptable because:

1. The frontend single-flight refresh guard (`refreshInFlight` promise in `http.ts`) prevents concurrent refresh calls for the same in-flight 401 burst. Legitimate clients will not replay a consumed token under normal conditions.
2. The 30-day token lifetime means retrying an already-consumed token after a legitimate rotation has completed is not a normal client behavior pattern — it is a strong signal of either a bug or theft.
3. Forcing full re-authentication is a low-cost consequence for the user and a high-cost consequence for the attacker. The security asymmetry favors this choice.

**Multi-device support** is achieved by allowing multiple active `RefreshToken` rows per user. There is no per-user token limit. Each device login creates a new row; each logout or family revocation event touches only the relevant rows (or all rows for that user, respectively).

**Atomicity** is enforced by `SELECT ... FOR UPDATE` on the consumed token row before any mutation. The consumed row soft-revoke and new row insert happen in the same transaction, committed via `repository.commit()` in the service layer after the rotation result is returned.

**Token uniqueness** is enforced by the `jti` UUID v4 extra claim added at token creation (`_create_refresh_token` in `AuthService`). This prevents hash collisions if two tokens happen to be issued with the same `sub`/`exp` pair, and provides a stable unique identifier for each token generation in the audit trail.

**Outcome classification** uses the `RefreshRotationOutcome` enum (`ROTATED`, `NOT_FOUND`, `REPLAY_DETECTED`, `EXPIRED`, `USER_MISMATCH`, `INACTIVE_USER`). The repository returns a typed `RefreshRotationResult`; the service maps all non-`ROTATED` outcomes to a single generic `401` — no outcome detail is leaked to the client.

---

## Consequences

**Security:**
- Replay of any consumed refresh token triggers immediate full session termination for the owning user across all devices.
- The consumed token row is never deleted; its `revoked_at` timestamp is the permanent record of when it was consumed or revoked.
- No raw token value ever reaches the database. Only `sha256(token).hexdigest()` is persisted (`hash_token` in `security.py`).
- The `SELECT ... FOR UPDATE` lock prevents two concurrent requests from both succeeding on the same token — only the first to acquire the lock proceeds through rotation; the second will see `revoked_at IS NOT NULL` and trigger family revocation.

**Maintainability:**
- `RefreshRotationOutcome` makes the repository→service contract explicit and exhaustive. Adding a new failure case requires updating the enum and handling it in the service.
- All error outcomes from `consume_and_rotate_refresh_token` collapse to a single `401` at the API boundary — no partial state is exposed.
- `revoke_all_user_tokens` is a bulk `UPDATE` (no ORM row loading), so it is efficient even for users with many active sessions.
- Tests assert DB state directly: `test_refresh_rotates_token_and_soft_revokes_consumed_token` inspects `revoked_at` on both the consumed and replacement rows; `test_refresh_replay_revokes_token_family` verifies all rows are revoked after a replay attempt.

**Performance:**
- Normal refresh path: one `SELECT ... FOR UPDATE` + one `INSERT` in a single transaction. Acceptable for a low-frequency 30-day operation.
- Replay path: an additional bulk `UPDATE` before the `401` response. Worst-case cost is proportional to the number of active refresh tokens for the user — bounded by device count in practice.
- `refresh_tokens.token_hash` is `unique` and `indexed`, so the lock query is an index seek.

**Revisit triggers:**
- If replay-triggered family revocation causes unacceptable UX friction (e.g., widespread client retry bugs that terminate legitimate sessions), the response can be downgraded to single-token revocation (Option A) without schema changes — only the `REPLAY_DETECTED` branch in the repository needs updating.
- If the `refresh_tokens` table grows large due to long-tail expired rows, a periodic cleanup job (delete rows where `expires_at < now - grace_period`) can be added without touching the rotation logic.
- If per-device session limits are needed in the future (e.g., cap active tokens at N per user), the `create_refresh_token` repository call can evict the oldest active row before inserting, using the existing `user_id` index.
