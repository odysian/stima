# SPEC-001J — Onboarding & Profile

**Parent umbrella:** `plans/react-native/SPEC-001-rn-expo-rewrite.md`
**Phase:** 3 Core Features
**Effort:** 3–4 days

## Goal

Port user onboarding (trade type, business info) and profile editing.

## References

- `frontend/src/features/profile/components/OnboardingForm.tsx` — Multi-step onboarding.
- `frontend/src/features/auth/components/LoginForm.tsx`
- `frontend/src/features/auth/components/RegisterForm.tsx`
- `frontend/src/features/auth/components/ForgotPasswordPage.tsx`
- `frontend/src/features/auth/components/ResetPasswordPage.tsx`

## Acceptance Criteria

- [ ] Login screen with email/password, link to register and forgot password.
- [ ] Register screen with validation, password requirements.
- [ ] Forgot password: email input, success state.
- [ ] Reset password: token validation, new password form.
- [ ] Onboarding: trade type selector, business name, timezone, logo upload (image picker).

## Scope Notes

- Preserve current onboarding semantics and auth affordances. This spec ports flows; it does not redefine onboarding requirements.
