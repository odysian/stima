import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { authService } from "@/features/auth/services/authService";
import { Button } from "@/shared/components/Button";
import { isHttpRequestError } from "@/shared/lib/http";
import { PasswordField } from "@/ui/PasswordField";

const RESET_PASSWORD_SUCCESS_MESSAGE = "Password reset successful. Please sign in.";
const BAD_TOKEN_MESSAGE = "This reset link is invalid or expired. Request a new reset link.";

interface LoginFlashState {
  flashMessage?: string;
}

export function ResetPasswordPage(): React.ReactElement {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBadToken, setIsBadToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const isMissingToken = token.length === 0;

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isMissingToken) {
      setIsBadToken(true);
      setError(null);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setError(null);
    setIsBadToken(false);
    setIsSubmitting(true);

    try {
      await authService.resetPassword(token, newPassword);
      navigate("/login", {
        replace: true,
        state: { flashMessage: RESET_PASSWORD_SUCCESS_MESSAGE } satisfies LoginFlashState,
      });
    } catch (submitError) {
      if (
        isHttpRequestError(submitError) &&
        submitError.status === 400 &&
        submitError.message === "Invalid or expired token"
      ) {
        setIsBadToken(true);
        return;
      }

      const message = submitError instanceof Error ? submitError.message : "Unable to reset password";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const shouldShowBadTokenState = isBadToken || isMissingToken;

  return (
    <main className="screen-radial-backdrop flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <h1 className="mb-8 font-headline text-3xl font-bold text-primary">Stima</h1>
      <section className="w-full max-w-sm rounded-[var(--radius-document)] bg-surface-container-lowest p-6 ghost-shadow">
        <h2 className="mb-6 font-headline text-2xl font-bold text-on-surface">Reset password</h2>

        {shouldShowBadTokenState ? (
          <div className="space-y-4">
            <div
              role="alert"
              className="rounded-[var(--radius-document)] border-l-4 border-error bg-error-container p-4"
            >
              <p className="text-sm font-medium text-error">{BAD_TOKEN_MESSAGE}</p>
            </div>
            <p className="text-sm text-on-surface-variant">
              <Link to="/forgot-password" className="font-semibold text-primary">
                Back to forgot password
              </Link>
            </p>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <PasswordField
              id="new-password"
              label="New Password"
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
            />
            <PasswordField
              id="confirm-password"
              label="Confirm Password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              showToggleLabel="Show password confirmation"
              hideToggleLabel="Hide password confirmation"
            />

            {error ? (
              <div
                role="alert"
                className="rounded-[var(--radius-document)] border-l-4 border-error bg-error-container p-4"
              >
                <p className="text-sm font-medium text-error">{error}</p>
              </div>
            ) : null}

            <Button type="submit" isLoading={isSubmitting} className="w-full">
              Reset Password
            </Button>
          </form>
        )}

        <p className="mt-6 text-sm text-on-surface-variant">
          <Link to="/login" className="font-semibold text-primary">
            Back to Login
          </Link>
        </p>
      </section>
    </main>
  );
}
