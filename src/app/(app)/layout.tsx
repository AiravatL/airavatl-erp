"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { AppShell } from "@/components/layout/app-shell";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LogOut } from "lucide-react";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-50 gap-4">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-gray-900 text-white text-xs font-bold flex items-center justify-center">A</div>
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <AppShell>{children}</AppShell>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
