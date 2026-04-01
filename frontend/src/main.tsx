import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import { BrowserRouter } from "react-router-dom";

import "@/index.css";
import App from "@/App";
import { AuthProvider } from "@/features/auth/hooks/useAuth";
import { ErrorFallback } from "@/shared/components/ErrorFallback";
import { ThemeProvider } from "@/shared/components/ThemeProvider";
import { initializeSentry } from "@/sentry";

initializeSentry();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </Sentry.ErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>,
);
