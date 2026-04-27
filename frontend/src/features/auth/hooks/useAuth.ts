import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  isExplicitAuthFailure,
  isOfflineOrNetworkFailure,
} from "@/features/auth/offline/authBootstrapErrors";
import {
  clearOfflineUserSnapshot,
  readOfflineUserSnapshot,
  writeOfflineUserSnapshot,
} from "@/features/auth/offline/offlineUserSnapshot";
import { authService } from "@/features/auth/services/authService";
import { AUTH_SESSION_EXPIRED_FLASH_KEY } from "@/features/auth/sessionFlash";
import type { AuthMode, LoginRequest, RegisterRequest, User } from "@/features/auth/types/auth.types";
import { clearDraftsForUser, deleteStaleLocalDrafts } from "@/features/quotes/offline/draftRepository";
import { runOutboxPass } from "@/features/quotes/offline/outboxEngine";
import { LoadingScreen } from "@/shared/components/LoadingScreen";
import { AUTH_FAILURE_EVENT, clearCsrfToken, hydrateCsrfTokenFromCookie } from "@/shared/lib/http";

interface AuthContextValue {
  user: User | null;
  authMode: AuthMode;
  isLoading: boolean;
  isOnboarded: boolean;
  refreshUser: () => Promise<void>;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (credentials: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const RECONNECT_REVERIFY_DEBOUNCE_MS = 1_500;

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("signed_out");
  const [isLoading, setIsLoading] = useState(true);
  const isReverifyInFlightRef = useRef(false);
  const lastReverifyAtRef = useRef(0);

  const setVerifiedUser = useCallback((currentUser: User) => {
    setUser(currentUser);
    setAuthMode("verified");
    writeOfflineUserSnapshot({
      userId: currentUser.id,
      isOnboarded: currentUser.is_onboarded,
      timezone: currentUser.timezone,
      lastVerifiedAt: new Date().toISOString(),
    });
  }, []);

  const forceSignedOut = useCallback(() => {
    clearCsrfToken();
    clearOfflineUserSnapshot();
    setUser(null);
    setAuthMode("signed_out");
  }, []);

  const refreshUser = useCallback(async () => {
    const currentUser = await authService.me();
    setVerifiedUser(currentUser);
    void deleteStaleLocalDrafts(currentUser.id, 7).catch((error) => {
      console.warn("Unable to clean stale local drafts during auth refresh.", error);
    });
  }, [setVerifiedUser]);

  useEffect(() => {
    let active = true;

    const bootstrapAuth = async () => {
      try {
        hydrateCsrfTokenFromCookie();
        const currentUser = await authService.me();
        if (active) {
          setVerifiedUser(currentUser);
          void deleteStaleLocalDrafts(currentUser.id, 7).catch((error) => {
            console.warn("Unable to clean stale local drafts during auth bootstrap.", error);
          });
        }
      } catch (bootstrapError) {
        if (!active) {
          return;
        }

        if (isExplicitAuthFailure(bootstrapError)) {
          forceSignedOut();
          return;
        }

        if (isOfflineOrNetworkFailure(bootstrapError)) {
          const snapshot = readOfflineUserSnapshot();
          if (snapshot) {
            setUser({
              id: snapshot.userId,
              email: "",
              is_active: true,
              is_onboarded: snapshot.isOnboarded,
              timezone: snapshot.timezone,
            });
            setAuthMode("offline_recovered");
            return;
          }
        }

        setUser(null);
        setAuthMode("signed_out");
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void bootstrapAuth();

    return () => {
      active = false;
    };
  }, [forceSignedOut, setVerifiedUser]);

  const reverifyOfflineRecoveredUser = useCallback(async () => {
    if (authMode !== "offline_recovered" || !user?.id) {
      return;
    }

    try {
      await refreshUser();
      await runOutboxPass(user.id, { forceAfterAuth: true });
    } catch (error) {
      if (isExplicitAuthFailure(error)) {
        forceSignedOut();
        return;
      }

      if (isOfflineOrNetworkFailure(error)) {
        return;
      }

      console.warn("Unable to reverify offline-recovered auth state.", error);
    }
  }, [authMode, forceSignedOut, refreshUser, user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleAuthFailure = () => {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(AUTH_SESSION_EXPIRED_FLASH_KEY, "1");
      }
      setIsLoading(false);
      forceSignedOut();
    };

    window.addEventListener(AUTH_FAILURE_EVENT, handleAuthFailure);
    return () => {
      window.removeEventListener(AUTH_FAILURE_EVENT, handleAuthFailure);
    };
  }, [forceSignedOut]);

  useEffect(() => {
    if (typeof window === "undefined" || authMode !== "offline_recovered") {
      return;
    }

    const onOnline = () => {
      if (!window.navigator.onLine) {
        return;
      }
      const now = Date.now();
      if (isReverifyInFlightRef.current || now - lastReverifyAtRef.current < RECONNECT_REVERIFY_DEBOUNCE_MS) {
        return;
      }

      isReverifyInFlightRef.current = true;
      lastReverifyAtRef.current = now;
      void reverifyOfflineRecoveredUser().finally(() => {
        isReverifyInFlightRef.current = false;
      });
    };

    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
    };
  }, [authMode, reverifyOfflineRecoveredUser]);

  const login = useCallback(async (credentials: LoginRequest) => {
    await authService.login(credentials);
    await refreshUser();
  }, [refreshUser]);

  const register = useCallback(async (credentials: RegisterRequest) => {
    await authService.register(credentials);
    await authService.login(credentials);
    await refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    const userId = user?.id;
    await authService.logout();
    clearOfflineUserSnapshot();
    if (userId) {
      await clearDraftsForUser(userId).catch((error) => {
        console.warn("Unable to clear local drafts during logout.", error);
      });
    }
    setUser(null);
    setAuthMode("signed_out");
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      authMode,
      isLoading,
      isOnboarded: user?.is_onboarded ?? false,
      refreshUser,
      login,
      register,
      logout,
    }),
    [authMode, isLoading, login, logout, refreshUser, register, user],
  );

  if (isLoading) {
    return createElement(LoadingScreen);
  }

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
