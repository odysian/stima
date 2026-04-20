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
import { CustomerCreateScreen } from "@/features/customers/components/CustomerCreateScreen";
import { CustomerDetailScreen } from "@/features/customers/components/CustomerDetailScreen";
import { CustomerListScreen } from "@/features/customers/components/CustomerListScreen";
import { InvoiceDetailScreen } from "@/features/invoices/components/InvoiceDetailScreen";
import { LandingPage } from "@/features/marketing/components/LandingPage";
import { PublicQuotePage } from "@/features/public/components/PublicQuotePage";
import { OnboardingForm } from "@/features/profile/components/OnboardingForm";
import { LineItemCatalogSettingsScreen } from "@/features/line-item-catalog/components/LineItemCatalogSettingsScreen";
import { CaptureScreen } from "@/features/quotes/components/CaptureScreen";
import { DocumentEditScreen } from "@/features/quotes/components/ReviewScreen";
import { QuoteList } from "@/features/quotes/components/QuoteList";
import { QuotePreview } from "@/features/quotes/components/QuotePreview";
import { SettingsScreen } from "@/features/settings/components/SettingsScreen";

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

function RootHome(): React.ReactElement {
  const { user, isOnboarded } = useAuth();

  if (!user) {
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
      <Route path="/doc/:token" element={<PublicQuotePage />} />
      <Route element={<OnboardingRoute />}>
        <Route path="/onboarding" element={<OnboardingForm />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/customers" element={<CustomerListScreen />} />
        <Route path="/customers/new" element={<CustomerCreateScreen />} />
        <Route path="/customers/:id" element={<CustomerDetailScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/settings/line-item-catalog" element={<LineItemCatalogSettingsScreen />} />
        <Route path="/invoices/:id" element={<InvoiceDetailScreen />} />
        <Route path="/invoices/:id/edit" element={<InvoiceEditRedirect />} />
        <Route path="/invoices/:id/edit/line-items/:lineItemIndex/edit" element={<InvoiceEditRedirect />} />
        <Route path="/quotes/new" element={<Navigate to="/quotes/capture" replace />} />
        <Route path="/quotes/capture" element={<CaptureScreen />} />
        <Route path="/quotes/capture/:customerId" element={<CaptureScreen />} />
        <Route path="/documents/:id/edit" element={<DocumentEditScreen />} />
        <Route path="/quotes/:id/review" element={<QuoteEditRedirect />} />
        <Route path="/quotes/:id/edit" element={<QuoteEditRedirect />} />
        <Route path="/quotes/:id/preview" element={<QuotePreview />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
