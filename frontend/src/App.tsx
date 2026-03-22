import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";

import { LoginForm } from "@/features/auth/components/LoginForm";
import { RegisterForm } from "@/features/auth/components/RegisterForm";
import { CustomerCreateScreen } from "@/features/customers/components/CustomerCreateScreen";
import { CustomerDetailScreen } from "@/features/customers/components/CustomerDetailScreen";
import { CustomerListScreen } from "@/features/customers/components/CustomerListScreen";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { CustomerSelectScreen } from "@/features/customers/components/CustomerSelectScreen";
import { OnboardingForm } from "@/features/profile/components/OnboardingForm";
import { CaptureScreen } from "@/features/quotes/components/CaptureScreen";
import { EditLineItemScreen } from "@/features/quotes/components/EditLineItemScreen";
import { QuoteList } from "@/features/quotes/components/QuoteList";
import { QuotePreview } from "@/features/quotes/components/QuotePreview";
import { ReviewScreen } from "@/features/quotes/components/ReviewScreen";
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
        <Route path="/" element={<QuoteList />} />
        <Route path="/customers" element={<CustomerListScreen />} />
        <Route path="/customers/new" element={<CustomerCreateScreen />} />
        <Route path="/customers/:id" element={<CustomerDetailScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/quotes/new" element={<CustomerSelectScreen />} />
        <Route path="/quotes/capture/:customerId" element={<CaptureScreen />} />
        <Route path="/quotes/review" element={<ReviewScreen />} />
        <Route path="/quotes/review/line-items/:lineItemIndex/edit" element={<EditLineItemScreen />} />
        <Route path="/quotes/:id/preview" element={<QuotePreview />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
