"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ChevronDown,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
} from "lucide-react";
import { Sidebar } from "./sidebar";
import { PageHeaderProvider, usePageHeaderInfo } from "./page-header-context";
import { useAuth } from "@/lib/auth/auth-context";
import { ROLE_LABELS } from "@/lib/auth/roles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <PageHeaderProvider>
      <div className="flex h-screen flex-col bg-gray-50">
        <TopBar
          onOpenMobileSidebar={() => setSidebarOpen(true)}
          onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="flex min-h-0 flex-1">
          {/* Desktop sidebar */}
          <div
            className={`hidden lg:flex lg:shrink-0 transition-[width] duration-200 ${
              sidebarCollapsed ? "lg:w-[76px]" : "lg:w-60"
            }`}
          >
            <Sidebar collapsed={sidebarCollapsed} />
          </div>

          {/* Mobile sidebar overlay */}
          {sidebarOpen && (
            <div className="fixed inset-0 z-[1100] lg:hidden">
              <div
                className="fixed inset-0 bg-black/30"
                onClick={() => setSidebarOpen(false)}
              />
              <div className="fixed inset-y-0 left-0 top-16 z-[1110] w-64">
                <Sidebar onNavigate={() => setSidebarOpen(false)} />
              </div>
            </div>
          )}

          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </PageHeaderProvider>
  );
}

function TopBar({
  onOpenMobileSidebar,
  onToggleCollapse,
  sidebarCollapsed,
}: {
  onOpenMobileSidebar: () => void;
  onToggleCollapse: () => void;
  sidebarCollapsed: boolean;
}) {
  const { user, logout } = useAuth();
  const info = usePageHeaderInfo();

  const initials = user?.fullName
    ? user.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : null;

  return (
    <header className="flex h-16 shrink-0 items-center border-b border-gray-200 bg-white">
      {/* Left chunk — matches sidebar width so toggle aligns with sidebar rail */}
      <div
        className={`flex h-full shrink-0 items-center gap-1 px-3 lg:justify-center ${
          sidebarCollapsed ? "lg:w-[76px]" : "lg:w-60"
        }`}
      >
        <button
          onClick={onOpenMobileSidebar}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 lg:inline-flex"
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {/* Right chunk — aligned with main content */}
      <div className="flex min-w-0 flex-1 items-center gap-3 px-4 sm:px-6">
        <div className="min-w-0 flex-1">
          {info ? (
            <>
              <h1 className="truncate text-lg font-semibold leading-tight text-gray-900">
                {info.title}
              </h1>
              {info.description ? (
                <p className="truncate text-xs text-gray-500">{info.description}</p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Open profile menu"
            className="group flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-3 text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 data-[state=open]:border-gray-300 data-[state=open]:bg-gray-50"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-violet-200 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
              {initials ?? <UserRound className="h-4 w-4" />}
            </div>
            <span className="hidden max-w-[140px] truncate text-sm font-medium text-gray-800 sm:inline">
              {user?.fullName ?? "Profile"}
            </span>
            <ChevronDown className="hidden h-4 w-4 text-gray-400 transition-transform group-data-[state=open]:rotate-180 sm:inline" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {user ? (
              <>
                <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
                  <span className="truncate text-sm font-semibold text-gray-900">
                    {user.fullName}
                  </span>
                  <span className="truncate text-xs font-normal text-gray-500">
                    {ROLE_LABELS[user.role]}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem asChild>
              <Link href="/profile" className="cursor-pointer">
                <UserRound className="mr-2 h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void logout();
              }}
              className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
