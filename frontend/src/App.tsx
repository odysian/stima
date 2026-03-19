import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { LoginForm } from "@/features/auth/components/LoginForm";
import { RegisterForm } from "@/features/auth/components/RegisterForm";
import { useAuth } from "@/features/auth/hooks/useAuth";

function ProtectedRoute(): React.ReactElement {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (!user && !isLoading) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

function PublicRoute({ children }: { children: React.ReactNode }): React.ReactElement {
  const { user, isLoading } = useAuth();

  if (user && !isLoading) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppShell(): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <h1 className="text-2xl font-semibold text-slate-900">Authenticated App Shell</h1>
    </main>
  );
}

function OnboardingPage(): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <h1 className="text-2xl font-semibold text-slate-900">Onboarding</h1>
    </main>
  );
}

export default function App(): React.ReactElement {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginForm />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterForm />
          </PublicRoute>
        }
      />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<AppShell />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
