"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import {
  LayoutDashboard,
  Users,
  Building2,
  CreditCard,
  Receipt,
  BarChart3,
  ShieldCheck,
  BookOpen,
  TrendingUp,
  PackagePlus,
  Truck,
  ChevronDown,
  MapPin,
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
  { label: "Auctions", href: "/delivery-requests", icon: PackagePlus, roles: ["super_admin", "admin", "operations"] },
  { label: "Trips", href: "/trips", icon: Truck, roles: ["super_admin", "admin", "operations"] },
  { label: "Fleet", href: "/fleet", icon: Building2, roles: ["super_admin", "admin", "operations", "sales_vehicles"] },
  { label: "Live Map", href: "/fleet/live-map", icon: MapPin, roles: ["super_admin", "admin", "operations"] },
  { label: "Payments", href: "/payments", icon: CreditCard, roles: ["super_admin", "admin", "accounts"] },
  { label: "Receivables", href: "/receivables", icon: Receipt, roles: ["super_admin", "admin", "accounts"] },
  { label: "Customers", href: "/customers", icon: Users, roles: ["super_admin", "admin", "sales_consigner"] },
  { label: "Consigner CRM", href: "/consigner-crm", icon: TrendingUp, roles: ["super_admin", "admin", "sales_consigner"] },
  { label: "Partner Verification", href: "/verification", icon: ShieldCheck, roles: ["super_admin", "admin", "sales_vehicles"] },
  { label: "Rate Library", href: "/rates", icon: BookOpen, roles: ["super_admin", "admin", "operations", "sales_consigner", "sales_vehicles"] },
  { label: "Reports", href: "/reports", icon: BarChart3, roles: ["super_admin", "admin"] },
  { label: "Administration", href: "/admin/users", icon: ShieldCheck, roles: ["super_admin", "admin"] },
];

const REPORT_SUB_ITEMS = [
  { label: "Overview", href: "/reports" },
  { label: "Analytics", href: "/reports/analytics" },
  { label: "Financial", href: "/reports/financial" },
  { label: "Customers", href: "/reports/customers" },
] as const;

const SALES_VEHICLES_ALLOWED_HREFS = new Set(["/dashboard", "/verification", "/rates", "/tickets"]);

export function Sidebar({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
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
    <div className="flex h-full flex-col border-r border-gray-200 bg-white">
      <nav className={cn("min-h-0 flex-1 space-y-0.5 overflow-y-auto py-3", collapsed ? "px-2" : "px-2")}>
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
                    collapsed && "justify-center pr-0",
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex min-w-0 flex-1 items-center px-3 py-2",
                      collapsed ? "justify-center" : "gap-3",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </Link>
                  {!collapsed ? (
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
                  ) : null}
                </div>

                {isReportsMenuOpen && !collapsed ? (
                  <div className="mt-1 space-y-0.5 pl-9">
                    {REPORT_SUB_ITEMS.map((subItem) => {
                      // "Overview" points at the parent /reports path itself,
                      // so it must match exactly — otherwise every deeper
                      // report would also light up "Overview".
                      const isSubActive =
                        subItem.href === "/reports"
                          ? pathname === "/reports"
                          : pathname === subItem.href || pathname.startsWith(subItem.href + "/");
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

          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                collapsed ? "justify-center" : "gap-3",
                isActive
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed ? item.label : null}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-gray-100 px-4 py-5">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center justify-center"
          aria-label="AiravatL ERP home"
        >
          <Image
            src="/airavat-logo.svg"
            alt="AiravatL"
            width={200}
            height={200}
            className={cn("w-auto object-contain", collapsed ? "h-10" : "h-20")}
            priority
          />
        </Link>
      </div>
    </div>
  );
}
