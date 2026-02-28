import { create } from "zustand";
import type { User } from "@/lib/types";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getCurrentUserProfile } from "@/lib/api/auth";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
  /** Call once on mount; returns an unsubscribe/cleanup function. */
  _initSession: () => () => void;
}

let _loginInProgress = false;
let _initialSessionChecked = false;
let _sessionInitInFlight: Promise<void> | null = null;
let _profileInFlight: Promise<User | null> | null = null;
let _profileCache: { value: User | null; at: number } | null = null;
const PROFILE_CACHE_TTL_MS = 5_000;

function clearProfileCache() {
  _profileInFlight = null;
  _profileCache = null;
}

function isProfileCacheFresh() {
  if (!_profileCache) return false;
  return Date.now() - _profileCache.at < PROFILE_CACHE_TTL_MS;
}

async function fetchProfile(options?: { force?: boolean }): Promise<User | null> {
  const force = options?.force ?? false;

  if (!force && isProfileCacheFresh()) {
    return _profileCache?.value ?? null;
  }

  if (!force && _profileInFlight) {
    return _profileInFlight;
  }

  _profileInFlight = (async () => {
    try {
      const user = await getCurrentUserProfile();
      _profileCache = { value: user, at: Date.now() };
      return user;
    } catch {
      _profileCache = { value: null, at: Date.now() };
      return null;
    } finally {
      _profileInFlight = null;
    }
  })();

  return _profileInFlight;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  _initSession: () => {
    const supabase = getSupabaseBrowserClient();
    let isMounted = true;

    const loadingFallbackTimer = window.setTimeout(() => {
      if (isMounted) set({ isLoading: false });
    }, 8000);

    const stopLoading = () => {
      clearTimeout(loadingFallbackTimer);
      if (isMounted) set({ isLoading: false });
    };

    async function initSession() {
      if (_initialSessionChecked) {
        stopLoading();
        return;
      }

      if (!_sessionInitInFlight) {
        _sessionInitInFlight = (async () => {
          try {
            const {
              data: { session },
            } = await supabase.auth.getSession();

            if (!session?.user) {
              if (isMounted) set({ user: null, isAuthenticated: false });
              return;
            }

            const profile = await fetchProfile();

            if (!profile || !profile.active) {
              await supabase.auth.signOut();
              clearProfileCache();
              if (isMounted) set({ user: null, isAuthenticated: false });
              return;
            }

            if (isMounted) set({ user: profile, isAuthenticated: true });
          } catch {
            if (isMounted) set({ user: null, isAuthenticated: false });
          } finally {
            _initialSessionChecked = true;
            _sessionInitInFlight = null;
          }
        })();
      }

      try {
        await _sessionInitInFlight;
      } finally {
        stopLoading();
      }
    }

    void initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        void (async () => {
          if (!isMounted) return;

          if (event === "INITIAL_SESSION") {
            // `getSession()` bootstrap above handles initial hydrate path.
            stopLoading();
            return;
          }

          if (event === "SIGNED_OUT") {
            clearProfileCache();
            set({ user: null, isAuthenticated: false });
            stopLoading();
            return;
          }

          if (_loginInProgress) return;

          if (event === "TOKEN_REFRESHED" && session?.user) {
            const currentState = useAuthStore.getState();
            if (
              currentState.isAuthenticated &&
              currentState.user?.id === session.user.id &&
              isProfileCacheFresh()
            ) {
              stopLoading();
              return;
            }
          }

          if (session?.user) {
            const profile = await fetchProfile();
            if (!profile || !profile.active) {
              await supabase.auth.signOut();
              clearProfileCache();
              if (isMounted) {
                set({ user: null, isAuthenticated: false });
                stopLoading();
              }
              return;
            }

            if (isMounted) {
              set({ user: profile, isAuthenticated: true });
              stopLoading();
            }
            return;
          }

          set({ user: null, isAuthenticated: false });
          stopLoading();
        })();
      }
    );

    return () => {
      isMounted = false;
      clearTimeout(loadingFallbackTimer);
      subscription.unsubscribe();
    };
  },

  login: async (email: string, password: string) => {
    if (_loginInProgress) {
      return { ok: false, message: "Login already in progress" };
    }

    _loginInProgress = true;
    try {
      const supabase = getSupabaseBrowserClient();

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { ok: false, message: error.message };
      }

      if (!data.user) {
        return { ok: false, message: "Login failed. No user returned." };
      }

      const profile = await fetchProfile({ force: true });

      if (!profile || !profile.active) {
        await supabase.auth.signOut();
        clearProfileCache();
        return { ok: false, message: "User profile is missing or inactive" };
      }

      set({ user: profile, isAuthenticated: true, isLoading: false });
      return { ok: true };
    } catch {
      return { ok: false, message: "Unexpected error during login" };
    } finally {
      _loginInProgress = false;
    }
  },

  logout: async () => {
    set({ user: null, isAuthenticated: false, isLoading: false });
    clearProfileCache();

    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // Network error — session cookies may linger, but user state is cleared
    }

    window.location.href = "/login";
  },
}));
