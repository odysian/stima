import { Suspense, lazy } from "react";
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";

import { ForgotPasswordPage } from "@/features/auth/components/ForgotPasswordPage";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { RegisterForm } from "@/features/auth/components/RegisterForm";
import { ResetPasswordPage } from "@/features/auth/components/ResetPasswordPage";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { LandingPage } from "@/features/marketing/components/LandingPage";
import { ArchiveList } from "@/features/quotes/components/ArchiveList";
import { QuoteList } from "@/features/quotes/components/QuoteList";
import { OutboxSyncCoordinator } from "@/features/quotes/offline/OutboxSyncCoordinator";
import { PwaUpdatePrompt } from "@/shared/components/PwaUpdatePrompt";
import { PageTransition } from "@/ui/PageTransition";
import { ToastProvider } from "@/ui/Toast";

const CustomerCreateScreen = lazy(() =>
  import("@/features/customers/components/CustomerCreateScreen").then((m) => ({ default: m.CustomerCreateScreen })),
);
const CustomerDetailScreen = lazy(() =>
  import("@/features/customers/components/CustomerDetailScreen").then((m) => ({ default: m.CustomerDetailScreen })),
);
const CustomerListScreen = lazy(() =>
  import("@/features/customers/components/CustomerListScreen").then((m) => ({ default: m.CustomerListScreen })),
);
const InvoiceDetailScreen = lazy(() =>
  import("@/features/invoices/components/InvoiceDetailScreen").then((m) => ({ default: m.InvoiceDetailScreen })),
);
const PublicQuotePage = lazy(() =>
  import("@/features/public/components/PublicQuotePage").then((m) => ({ default: m.PublicQuotePage })),
);
const OnboardingForm = lazy(() =>
  import("@/features/profile/components/OnboardingForm").then((m) => ({ default: m.OnboardingForm })),
);
const LineItemCatalogSettingsScreen = lazy(() =>
  import("@/features/line-item-catalog/components/LineItemCatalogSettingsScreen").then((m) => ({
    default: m.LineItemCatalogSettingsScreen,
  })),
);
const CaptureScreen = lazy(() =>
  import("@/features/quotes/components/CaptureScreen").then((m) => ({ default: m.CaptureScreen })),
);
const DocumentEditScreen = lazy(() =>
  import("@/features/quotes/components/ReviewScreen").then((m) => ({ default: m.DocumentEditScreen })),
);
const QuotePreview = lazy(() =>
  import("@/features/quotes/components/QuotePreview").then((m) => ({ default: m.QuotePreview })),
);
const SettingsScreen = lazy(() =>
  import("@/features/settings/components/SettingsScreen").then((m) => ({ default: m.SettingsScreen })),
);

function ProtectedRoute(): React.ReactElement {
  const { authMode, isOnboarded } = useAuth();
  const location = useLocation();

  if (authMode === "signed_out") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (!isOnboarded) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

function PublicRoute({ children }: { children: React.ReactNode }): React.ReactElement {
  const { authMode } = useAuth();

  if (authMode !== "signed_out") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function OnboardingRoute(): React.ReactElement {
  const { authMode, isOnboarded } = useAuth();

  if (authMode === "signed_out") {
    return <Navigate to="/login" replace />;
  }
  if (isOnboarded) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function RootHome(): React.ReactElement {
  const { authMode, isOnboarded } = useAuth();

  if (authMode === "signed_out") {
    return <LandingPage />;
  }
  if (!isOnboarded) {
    return <Navigate to="/onboarding" replace />;
  }

  return <QuoteList />;
}

function QuoteEditRedirect(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/documents/${id}/edit` : "/"} replace />;
}

function InvoiceEditRedirect(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/documents/${id}/edit` : "/"} replace />;
}

function withRouteSuspense(node: React.ReactNode): React.ReactElement {
  return <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>{node}</Suspense>;
}

export default function App(): React.ReactElement {
  return (
    <ToastProvider>
      <OutboxSyncCoordinator />
      <PwaUpdatePrompt />
      <Routes>
        <Route element={<PageTransition />}>
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
          <Route
            path="/forgot-password"
            element={
              <PublicRoute>
                <ForgotPasswordPage />
              </PublicRoute>
            }
          />
          <Route
            path="/reset-password"
            element={
              <PublicRoute>
                <ResetPasswordPage />
              </PublicRoute>
            }
          />
          <Route path="/" element={<RootHome />} />
          <Route path="/doc/:token" element={withRouteSuspense(<PublicQuotePage />)} />
          <Route element={<OnboardingRoute />}>
            <Route path="/onboarding" element={withRouteSuspense(<OnboardingForm />)} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/customers" element={withRouteSuspense(<CustomerListScreen />)} />
            <Route path="/customers/new" element={withRouteSuspense(<CustomerCreateScreen />)} />
            <Route path="/customers/:id" element={withRouteSuspense(<CustomerDetailScreen />)} />
            <Route path="/settings" element={withRouteSuspense(<SettingsScreen />)} />
            <Route
              path="/settings/line-item-catalog"
              element={withRouteSuspense(<LineItemCatalogSettingsScreen />)}
            />
            <Route path="/invoices/:id" element={withRouteSuspense(<InvoiceDetailScreen />)} />
            <Route path="/invoices/:id/edit" element={<InvoiceEditRedirect />} />
            <Route path="/invoices/:id/edit/line-items/:lineItemIndex/edit" element={<InvoiceEditRedirect />} />
            <Route path="/quotes/new" element={<Navigate to="/quotes/capture" replace />} />
            <Route path="/archived" element={<ArchiveList />} />
            <Route path="/quotes/capture" element={withRouteSuspense(<CaptureScreen />)} />
            <Route path="/quotes/capture/:customerId" element={withRouteSuspense(<CaptureScreen />)} />
            <Route path="/documents/:id/edit" element={withRouteSuspense(<DocumentEditScreen />)} />
            <Route path="/quotes/:id/review" element={<QuoteEditRedirect />} />
            <Route path="/quotes/:id/edit" element={<QuoteEditRedirect />} />
            <Route path="/quotes/:id/preview" element={withRouteSuspense(<QuotePreview />)} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}
