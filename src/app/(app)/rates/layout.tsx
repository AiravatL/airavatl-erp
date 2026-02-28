"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";

const TABS = [
  { label: "All Rates", href: "/rates" },
  {
    label: "Rate Requests",
    href: "/rates/requests",
    roles: [
      "super_admin",
      "admin",
      "operations_consigner",
      "sales_consigner",
      "operations_vehicles",
      "sales_vehicles",
    ] as const,
  },
  {
    label: "Request Rate",
    href: "/rates/request",
    roles: ["super_admin", "admin", "operations_consigner", "sales_consigner"] as const,
  },
  { label: "Rate Review", href: "/rates/review", roles: ["super_admin", "admin", "operations_vehicles", "sales_vehicles"] as const },
  { label: "Submit Rate", href: "/rates/submit", roles: ["operations_vehicles", "sales_vehicles", "super_admin", "admin"] as const },
];

export default function RatesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();

  const visibleTabs = TABS.filter(
    (tab) => !tab.roles || (user && (tab.roles as readonly string[]).includes(user.role))
  );
  const isTabActive = (href: string) => {
    if (href === "/rates") {
      return (
        pathname.startsWith("/rates") &&
        !pathname.startsWith("/rates/review") &&
        !pathname.startsWith("/rates/submit") &&
        !pathname.startsWith("/rates/request")
      );
    }
    return pathname === href;
  };

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 border-b border-gray-200">
        {visibleTabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              isTabActive(tab.href)
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
