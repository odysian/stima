# Reference: FastAPI Security Baseline

Apply this baseline for new projects.

## Auth and Tokens

- Use `PyJWT` for access token handling.
- Use Argon2 password hashing.
- Use dummy password verify on unknown username in login path.
- Keep access token short-lived.
- Store refresh tokens as opaque random values in DB.

## Cookies and CSRF

- Set `access_token` and `refresh_token` as httpOnly cookies.
- Path-scope cookies where possible (`/api/`, `/api/auth/`).
- Use CSRF double-submit for mutating cookie-auth requests.
- Compare CSRF values with timing-safe compare.

## API Hardening

- Use explicit CORS origins.
- Use explicit CORS methods and headers.
- Add security headers middleware (`nosniff`, `frame deny`, HSTS, referrer policy, permissions policy).
- Rate-limit auth endpoints.

## Operational Safety

- Do not log secrets, raw tokens, or credentials.
- Validate schema lengths for auth fields.
- Return generic auth errors for bad username/password.
