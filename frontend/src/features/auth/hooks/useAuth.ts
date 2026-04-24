import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { authService } from "@/features/auth/services/authService";
import { clearDraftsForUser, deleteStaleLocalDrafts } from "@/features/quotes/offline/draftRepository";
import type { LoginRequest, RegisterRequest, User } from "@/features/auth/types/auth.types";
import { LoadingScreen } from "@/shared/components/LoadingScreen";
import { hydrateCsrfTokenFromCookie } from "@/shared/lib/http";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isOnboarded: boolean;
  refreshUser: () => Promise<void>;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (credentials: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const currentUser = await authService.me();
    setUser(currentUser);
    void deleteStaleLocalDrafts(currentUser.id, 7).catch((error) => {
      console.warn("Unable to clean stale local drafts during auth refresh.", error);
    });
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrapAuth = async () => {
      try {
        hydrateCsrfTokenFromCookie();
        const currentUser = await authService.me();
        if (active) {
          setUser(currentUser);
          void deleteStaleLocalDrafts(currentUser.id, 7).catch((error) => {
            console.warn("Unable to clean stale local drafts during auth bootstrap.", error);
          });
        }
      } catch {
        if (active) {
          setUser(null);
        }
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
  }, []);

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
    if (userId) {
      await clearDraftsForUser(userId).catch((error) => {
        console.warn("Unable to clear local drafts during logout.", error);
      });
    }
    setUser(null);
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isOnboarded: user?.is_onboarded ?? false,
      refreshUser,
      login,
      register,
      logout,
    }),
    [isLoading, login, logout, refreshUser, register, user],
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
