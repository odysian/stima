# Task A: Backend auth register & rate limit tests

**Parent Spec:** [Test gap coverage](spec-test-coverage.md)
**Mode:** gated child task
**Type:** test-only (no behavior changes)

## Summary

The register endpoint (`POST /api/auth/register`) is called as a setup step in 10+ other tests but has zero dedicated test cases. It has Pydantic validation (`EmailStr`, password `min_length=8 max_length=128`), rate limiting (3/hour), and conflict handling (duplicate email) — none of which are explicitly verified. Auth rate limits on login, refresh, and logout are also untested.

## Scope

### 1. Register endpoint tests (in `test_auth_api.py`)

**Happy path:**
- `test_register_returns_201_with_user_payload` — verify response shape matches `RegisterResponse` schema (user.id, user.email, user.is_active, user.is_onboarded=false)
- `test_register_does_not_set_auth_cookies` — register should NOT set access/refresh/csrf cookies (user must explicitly login after)

**Validation (422s):**
- `test_register_rejects_invalid_email_format` — `"not-an-email"` → 422
- `test_register_rejects_short_password` — `"Short1!"` (7 chars) → 422
- `test_register_rejects_long_password` — 129-char password → 422
- `test_register_rejects_missing_email` — `{ "password": "..." }` → 422
- `test_register_rejects_missing_password` — `{ "email": "..." }` → 422

**Conflict (409):**
- `test_register_rejects_duplicate_email` — register same email twice → 409 with `"Email is already registered"` (exact string from `AuthService.register` in service.py)

**Rate limiting (429):**
- `test_register_rate_limit_enforced` — 4th registration attempt within the hour → 429

### 2. Auth rate limit tests (in `test_auth_api.py`)

These follow the same pattern already established in `test_quotes.py` for extraction rate limits (see `test_extract_combined_rate_limit_returns_429` at ~line 597):

- `test_login_rate_limit_enforced` — 6th login attempt within a minute → 429
- `test_refresh_rate_limit_enforced` — 11th refresh attempt within a minute → 429
- `test_logout_rate_limit_enforced` — 11th logout attempt within a minute → 429

**Implementation note — rate limit tests require two things:**

1. **Enable the limiter** via `monkeypatch.setattr(app.state.limiter, "enabled", True)` where `app` is imported from `app.main`. By default the limiter is disabled in tests.

2. **Reset the limiter** between tests to prevent bleed-over. Add an autouse fixture (mirrors `_reset_rate_limiter` in `test_quotes.py`):
   ```python
   from app.shared.rate_limit import limiter as _shared_limiter

   @pytest.fixture(autouse=True)
   def _reset_rate_limiter() -> Iterator[None]:
       _shared_limiter.reset()
       yield
       _shared_limiter.reset()
   ```

Reference implementation: `test_extract_combined_rate_limit_returns_429` in `test_quotes.py` (around line 597) — it performs N successful requests then asserts the (N+1)th returns 429.

### 3. Login validation tests (in `test_auth_api.py`)

These are minor additions while we're in the file:

- `test_login_rejects_invalid_email_format` — 422
- `test_login_rejects_wrong_password` — 401 with generic `"Invalid credentials"`
- `test_login_rejects_nonexistent_email` — 401 with generic `"Invalid credentials"` (same error to prevent email enumeration)

## Files touched

**Modified:**
- `backend/app/features/auth/tests/test_auth_api.py` (add ~15 test functions, ~200 LOC)

## Acceptance criteria

- [ ] Register happy path: 201 response, correct schema, no auth cookies set
- [ ] Register validation: invalid email, short/long password, missing fields all return 422
- [ ] Register conflict: duplicate email returns 409
- [ ] Register rate limit: 4th request returns 429
- [ ] Login validation: invalid email 422, wrong password 401, nonexistent email 401
- [ ] Login rate limit: 6th request returns 429
- [ ] Refresh rate limit: 11th request returns 429
- [ ] Logout rate limit: 11th request returns 429
- [ ] All existing tests still pass
- [ ] No behavior changes — tests only

## Do NOT duplicate

The following scenarios are already tested and should NOT be re-added:
- Login sets auth cookies and returns CSRF (`test_login_sets_auth_cookies_and_returns_csrf`)
- Login with prod cookie domain config (`test_login_uses_env_configured_prod_cookie_domain`)
- Refresh CSRF validation (`test_refresh_rejects_missing_csrf_header`, `test_refresh_rejects_csrf_mismatch`)
- Refresh token rotation (`test_refresh_rotates_token_and_soft_revokes_consumed_token`)
- Refresh token replay attack (`test_refresh_replay_revokes_token_family`)
- Logout cookie clearing and token revocation (`test_logout_clears_auth_cookies_and_revokes_refresh_token`)
- Logout with expired refresh token (`test_logout_with_expired_refresh_token_still_clears_cookies`)
- Me endpoint happy path and auth guard (`test_me_returns_authenticated_user`, `test_me_requires_authentication`)
- Login rejects inactive user (`test_login_rejects_inactive_user_with_generic_error`)

## Verification

```bash
make backend-verify
```
