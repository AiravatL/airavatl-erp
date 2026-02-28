"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ADMIN_TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/vehicle-master", label: "Vehicle Master" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-4">
      <div className="px-4 pt-4 sm:px-6 sm:pt-6">
        <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-1">
          {ADMIN_TABS.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
      {children}
    </div>
  );
}
