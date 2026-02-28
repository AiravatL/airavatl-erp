"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { ROLE_LABELS } from "@/lib/auth/roles";
import {
  LayoutDashboard,
  Truck,
  Users,
  Building2,
  CreditCard,
  Receipt,
  TicketCheck,
  BarChart3,
  ShieldCheck,
  LogOut,
  BookOpen,
  TrendingUp,
  ContactRound,
  UserRound,
  History,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/types";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Trips", href: "/trips", icon: Truck },
  { label: "Trip History", href: "/trips/history", icon: History },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Fleet", href: "/vendors", icon: Building2 },
  { label: "Payments", href: "/payments", icon: CreditCard, roles: ["super_admin", "admin", "accounts"] },
  { label: "Consigner CRM", href: "/consigner-crm", icon: TrendingUp, roles: ["super_admin", "admin", "sales_consigner"] },
  { label: "Vehicle CRM", href: "/vehicle-crm", icon: ContactRound, roles: ["super_admin", "admin", "sales_vehicles"] },
  { label: "Receivables", href: "/receivables", icon: Receipt, roles: ["super_admin", "admin", "sales_consigner", "sales_vehicles", "accounts"] },
  { label: "Rate Library", href: "/rates", icon: BookOpen },
  { label: "Tickets", href: "/tickets", icon: TicketCheck },
  { label: "Reports", href: "/reports", icon: BarChart3, roles: ["super_admin", "admin", "accounts"] },
  { label: "Administration", href: "/admin/users", icon: ShieldCheck, roles: ["super_admin", "admin"] },
];

const REPORT_SUB_ITEMS = [
  { label: "Trip P&L", href: "/reports/trip-pnl" },
  { label: "Fuel Variance", href: "/reports/fuel-variance" },
  { label: "Expense Summary", href: "/reports/expense-summary" },
  { label: "Utilization", href: "/reports/utilization" },
  { label: "Sales Performance", href: "/reports/sales-performance" },
  { label: "Receivables Aging", href: "/reports/receivables-aging" },
] as const;

const SALES_VEHICLES_ALLOWED_HREFS = new Set(["/dashboard", "/vehicle-crm", "/rates", "/tickets"]);

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const isReportsPath = pathname === "/reports" || pathname.startsWith("/reports/");
  const [reportsExpanded, setReportsExpanded] = useState(false);
  const isReportsMenuOpen = isReportsPath || reportsExpanded;

  if (!user) return null;

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (user.role === "sales_vehicles") {
      return SALES_VEHICLES_ALLOWED_HREFS.has(item.href);
    }
    return !item.roles || item.roles.includes(user.role);
  });

  return (
    <div className="flex h-full flex-col bg-white border-r border-gray-200">
      <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-100">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white text-sm font-bold">
          A
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-900">AiravatL ERP</span>
          <span className="text-[11px] text-gray-500">V1</span>
        </div>
        <Link
          href="/profile"
          onClick={onNavigate}
          aria-label="Open profile"
          className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
        >
          <UserRound className="h-4 w-4" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {visibleItems.map((item) => {
          if (item.href === "/reports") {
            const Icon = item.icon;
            return (
              <div key={item.href}>
                <div
                  className={cn(
                    "flex items-center rounded-md pr-1 text-sm font-medium transition-colors",
                    isReportsPath
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                  )}
                >
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                  <button
                    type="button"
                    aria-label={isReportsMenuOpen ? "Collapse reports menu" : "Expand reports menu"}
                    onClick={() => setReportsExpanded((current) => !current)}
                    className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                  >
                    <ChevronDown
                      className={cn("h-4 w-4 transition-transform", isReportsMenuOpen ? "rotate-180" : "rotate-0")}
                    />
                  </button>
                </div>

                {isReportsMenuOpen ? (
                  <div className="mt-1 space-y-0.5 pl-9">
                    {REPORT_SUB_ITEMS.map((subItem) => {
                      const isSubActive =
                        pathname === subItem.href || pathname.startsWith(subItem.href + "/");
                      return (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          onClick={onNavigate}
                          className={cn(
                            "block rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                            isSubActive
                              ? "bg-gray-100 text-gray-900"
                              : "text-gray-500 hover:bg-gray-50 hover:text-gray-700",
                          )}
                        >
                          {subItem.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          }

          const isTripsHistoryPath = pathname === "/trips/history" || pathname.startsWith("/trips/history/");
          const isActive =
            item.href === "/trips"
              ? (pathname === item.href || pathname.startsWith(item.href + "/")) && !isTripsHistoryPath
              : pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-100 p-3 space-y-2">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-700">
            {user.fullName.split(" ").map((n) => n[0]).join("")}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{user.fullName}</p>
            <p className="truncate text-[11px] text-gray-500">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>

        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 hover:text-red-800"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
