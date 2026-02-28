"use client";

import { useEffect, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAuthStore } from "@/lib/stores/auth-store";

/**
 * Thin wrapper that initialises the Zustand auth session once on mount.
 * Drop-in replacement for the old `<AuthProvider>`.
 */
export function AuthInit({ children }: { children: ReactNode }) {
  const initSession = useAuthStore((s) => s._initSession);

  useEffect(() => {
    const cleanup = initSession();
    return cleanup;
  }, [initSession]);

  return <>{children}</>;
}

/**
 * Public hook — same shape as the old Context-based useAuth().
 * No consumer changes required.
 */
export function useAuth() {
  return useAuthStore(
    useShallow((s) => ({
      user: s.user,
      isAuthenticated: s.isAuthenticated,
      isLoading: s.isLoading,
      login: s.login,
      logout: s.logout,
    }))
  );
}
