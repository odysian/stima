import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { Button } from "@/shared/components/Button";
import { Input } from "@/shared/components/Input";

export function RegisterForm(): React.ReactElement {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordsMatch = password === confirmPassword;
  const showPasswordMismatch = confirmPassword.length > 0 && !passwordsMatch;

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!passwordsMatch) {
      return;
    }
    setIsSubmitting(true);

    try {
      await register({ email, password });
      navigate("/onboarding", { replace: true });
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Registration failed";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="screen-radial-backdrop flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <h1 className="mb-8 font-headline text-3xl font-bold text-primary">Stima</h1>
      <section className="w-full max-w-sm rounded-xl bg-surface-container-lowest p-6 ghost-shadow">
        <h2 className="mb-6 font-headline text-2xl font-bold text-on-surface">Create your account</h2>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <Input
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-on-surface">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={isPasswordVisible ? "text" : "password"}
                autoComplete="new-password"
                required
                aria-required="true"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={[
                  "w-full bg-surface-container-high rounded-lg px-4 py-3 pr-20 font-body text-sm text-on-surface",
                  "placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-surface-container-lowest transition-all",
                ].join(" ")}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-3 cursor-pointer text-xs font-semibold text-primary"
                aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                aria-pressed={isPasswordVisible}
                onClick={() => setIsPasswordVisible((visible) => !visible)}
              >
                {isPasswordVisible ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="confirm-password" className="text-sm font-medium text-on-surface">
              Confirm Password
            </label>
            <div className="relative">
              <input
                id="confirm-password"
                type={isConfirmPasswordVisible ? "text" : "password"}
                autoComplete="new-password"
                required
                aria-required="true"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                aria-invalid={showPasswordMismatch}
                aria-describedby={showPasswordMismatch ? "confirm-password-error" : undefined}
                className={[
                  "w-full bg-surface-container-high rounded-lg px-4 py-3 pr-28 font-body text-sm text-on-surface",
                  "placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-surface-container-lowest transition-all",
                ].join(" ")}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-3 cursor-pointer text-xs font-semibold text-primary"
                aria-label={isConfirmPasswordVisible ? "Hide confirm password" : "Show confirm password"}
                aria-pressed={isConfirmPasswordVisible}
                onClick={() => setIsConfirmPasswordVisible((visible) => !visible)}
              >
                {isConfirmPasswordVisible ? "Hide" : "Show"}
              </button>
            </div>
            {showPasswordMismatch ? (
              <p id="confirm-password-error" className="text-xs text-error">
                Passwords do not match.
              </p>
            ) : null}
          </div>

          {error ? (
            <div role="alert" className="rounded-lg border-l-4 border-error bg-error-container p-4">
              <p className="text-sm font-medium text-error">{error}</p>
            </div>
          ) : null}

          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={!passwordsMatch}
            className="w-full"
          >
            Create Account →
          </Button>
        </form>

        <p className="mt-6 text-sm text-on-surface-variant">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-primary">
            Sign In
          </Link>
        </p>
      </section>
    </main>
  );
}
