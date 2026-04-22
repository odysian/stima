import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { authService } from "@/features/auth/services/authService";
import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";

const FORGOT_PASSWORD_SUCCESS_MESSAGE =
  "If an account exists with that email, you'll receive a reset link.";

interface LoginFlashState {
  flashMessage?: string;
}

export function ForgotPasswordPage(): React.ReactElement {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await authService.forgotPassword(email);
      navigate("/login", {
        replace: true,
        state: { flashMessage: FORGOT_PASSWORD_SUCCESS_MESSAGE } satisfies LoginFlashState,
      });
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Unable to send reset link";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="screen-radial-backdrop flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <h1 className="mb-8 font-headline text-3xl font-bold text-primary">Stima</h1>
      <section className="w-full max-w-sm rounded-[var(--radius-document)] bg-surface-container-lowest p-6 ghost-shadow">
        <h2 className="mb-2 font-headline text-2xl font-bold text-on-surface">Forgot password?</h2>
        <p className="mb-6 text-sm text-on-surface-variant">
          Enter your email and we&apos;ll send a reset link if your account exists.
        </p>

        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <Input
            id="email"
            label="Email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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
            Send Reset Link
          </Button>
        </form>

        <p className="mt-6 text-sm text-on-surface-variant">
          <Link to="/login" className="font-semibold text-primary">
            Back to Login
          </Link>
        </p>
      </section>
    </main>
  );
}
