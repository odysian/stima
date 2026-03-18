# Reference: JWT Cookie Auth Flow

## Login

1. Client posts username/password.
2. Backend verifies credentials and issues:
- access JWT
- opaque refresh token row
- csrf token value
3. Backend sets cookies and returns JSON body:
- `access_token`
- `refresh_token`
- `csrf_token`
- `token_type`

## Authenticated Request (Cookie Path)

1. Browser sends access cookie automatically.
2. Frontend sends `X-CSRF-Token` on mutating requests.
3. Backend validates access token and CSRF.

## Refresh

1. On `401`, frontend calls `/api/auth/refresh` once.
2. Backend validates refresh token, rotates token row, sets fresh cookies, returns fresh CSRF token body.
3. Frontend retries original request once.

## Logout

1. Frontend calls `/api/auth/logout`.
2. Backend deletes refresh token row if present.
3. Backend clears auth cookies.
4. Frontend clears local CSRF marker.
