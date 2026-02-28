"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReportStatus } from "@/lib/api/reports";
import { cn } from "@/lib/utils";
import { ReportStatusBadge } from "@/components/reports/report-status-badge";

interface ReportLinkItem {
  key: "tripPnl" | "fuelVariance" | "expenseSummary" | "utilization" | "salesPerformance" | "receivablesAging";
  label: string;
  href: string;
}

const REPORT_ITEMS: ReportLinkItem[] = [
  { key: "tripPnl", label: "Trip P&L", href: "/reports/trip-pnl" },
  { key: "fuelVariance", label: "Fuel Variance", href: "/reports/fuel-variance" },
  { key: "expenseSummary", label: "Expense Summary", href: "/reports/expense-summary" },
  { key: "utilization", label: "Utilization", href: "/reports/utilization" },
  { key: "salesPerformance", label: "Sales Performance", href: "/reports/sales-performance" },
  { key: "receivablesAging", label: "Receivables Aging", href: "/reports/receivables-aging" },
];

export type ReportStatusMap = Record<ReportLinkItem["key"], ReportStatus>;

interface ReportsNavProps {
  statuses?: Partial<ReportStatusMap>;
}

export function ReportsNav({ statuses }: ReportsNavProps) {
  const pathname = usePathname();

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {REPORT_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        const status = statuses?.[item.key] ?? "partial";

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
              isActive ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white hover:bg-gray-50",
            )}
          >
            <span className={cn("font-medium", isActive ? "text-white" : "text-gray-700")}>{item.label}</span>
            <ReportStatusBadge status={status} className={isActive ? "bg-white text-gray-900" : ""} />
          </Link>
        );
      })}
    </div>
  );
}
