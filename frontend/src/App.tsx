import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import { LoginForm } from "@/features/auth/components/LoginForm";
import { RegisterForm } from "@/features/auth/components/RegisterForm";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { CustomerSelectScreen } from "@/features/customers/components/CustomerSelectScreen";
import { OnboardingForm } from "@/features/profile/components/OnboardingForm";
import { CaptureScreen } from "@/features/quotes/components/CaptureScreen";
import { ReviewScreen } from "@/features/quotes/components/ReviewScreen";

function ProtectedRoute(): React.ReactElement {
  const { user, isOnboarded } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (!isOnboarded) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

function PublicRoute({ children }: { children: React.ReactNode }): React.ReactElement {
  const { user } = useAuth();

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function OnboardingRoute(): React.ReactElement {
  const { user, isOnboarded } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (isOnboarded) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function AppShell(): React.ReactElement {
  const navigate = useNavigate();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <section className="flex flex-col items-center gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">Authenticated App Shell</h1>
        <button
          type="button"
          onClick={() => navigate("/quotes/new")}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          New Quote
        </button>
      </section>
    </main>
  );
}

function QuotePreviewPlaceholder(): React.ReactElement {
  const { id } = useParams<{ id: string }>();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <section className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Quote preview coming soon</h1>
        <p className="mt-2 text-sm text-slate-600">
          Placeholder route for Task 4 PDF preview.
        </p>
        <p className="mt-4 text-sm text-slate-700">Quote ID: {id}</p>
      </section>
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
      <Route element={<OnboardingRoute />}>
        <Route path="/onboarding" element={<OnboardingForm />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<AppShell />} />
        <Route path="/quotes/new" element={<CustomerSelectScreen />} />
        <Route path="/quotes/capture/:customerId" element={<CaptureScreen />} />
        <Route path="/quotes/review" element={<ReviewScreen />} />
        <Route path="/quotes/:id/preview" element={<QuotePreviewPlaceholder />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
