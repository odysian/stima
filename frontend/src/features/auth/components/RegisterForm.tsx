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
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
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
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error ? (
            <div role="alert" className="rounded-lg border-l-4 border-error bg-error-container p-4">
              <p className="text-sm font-medium text-error">{error}</p>
            </div>
          ) : null}

          <Button type="submit" isLoading={isSubmitting} className="w-full">
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
