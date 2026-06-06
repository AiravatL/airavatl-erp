"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";

type Accent = "gray" | "amber" | "violet" | "blue" | "indigo" | "purple" | "rose" | "emerald" | "cyan";

const ACCENT_BAR: Record<Accent, string> = {
  gray: "bg-gray-300",
  amber: "bg-amber-400",
  violet: "bg-violet-400",
  blue: "bg-blue-400",
  indigo: "bg-indigo-400",
  purple: "bg-purple-400",
  rose: "bg-rose-400",
  emerald: "bg-emerald-400",
  cyan: "bg-cyan-400",
};

const ACCENT_BADGE: Record<Accent, string> = {
  gray: "bg-gray-100 text-gray-600",
  amber: "bg-amber-100 text-amber-700",
  violet: "bg-violet-100 text-violet-700",
  blue: "bg-blue-100 text-blue-700",
  indigo: "bg-indigo-100 text-indigo-700",
  purple: "bg-purple-100 text-purple-700",
  rose: "bg-rose-100 text-rose-700",
  emerald: "bg-emerald-100 text-emerald-700",
  cyan: "bg-cyan-100 text-cyan-700",
};

/**
 * Shared dashboard list panel: accent-barred header with an optional count
 * badge + "View all" link, and built-in loading / empty states. Rows are
 * passed as children (see {@link PanelRow}).
 */
export function DashboardPanel({
  title,
  count,
  accent = "gray",
  viewAllHref,
  viewAllLabel = "View all",
  isLoading,
  isEmpty,
  emptyIcon: EmptyIcon,
  emptyLabel,
  children,
}: {
  title: string;
  count?: number;
  accent?: Accent;
  viewAllHref?: string;
  viewAllLabel?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyIcon: React.ComponentType<{ className?: string }>;
  emptyLabel: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-4 w-1 shrink-0 rounded-full ${ACCENT_BAR[accent]}`} />
          <h2 className="truncate text-sm font-semibold text-gray-900">{title}</h2>
          {count && count > 0 ? (
            <span
              className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${ACCENT_BADGE[accent]}`}
            >
              {count}
            </span>
          ) : null}
        </div>
        {viewAllHref ? (
          <Link
            href={viewAllHref}
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-gray-900"
          >
            {viewAllLabel} <ArrowRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 px-4 py-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-gray-100" />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="px-4 py-8 text-center">
            <EmptyIcon className="mx-auto mb-2 h-8 w-8 text-gray-200" />
            <p className="text-sm text-gray-400">{emptyLabel}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

/** A single row inside a {@link DashboardPanel}. */
export function PanelRow({
  href,
  leading,
  title,
  subtitle,
  trailing,
}: {
  href: string;
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50/80"
    >
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-900">{title}</div>
        {subtitle ? <p className="truncate text-xs text-gray-500">{subtitle}</p> : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </Link>
  );
}

/** Small circular initials/icon chip used as a row's leading element. */
export function RowChip({
  label,
  icon: Icon,
  accent = "gray",
}: {
  label?: string | null;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: Accent;
}) {
  const initials = label
    ? label
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : null;
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${ACCENT_BADGE[accent]}`}
    >
      {Icon ? <Icon className="h-4 w-4" /> : initials ?? "—"}
    </div>
  );
}

/** Refined KPI stat card used in the dashboard stat row. */
export function StatCard({
  icon: Icon,
  iconBg,
  iconColor,
  value,
  label,
  isAmount,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  value: number;
  label: string;
  isAmount?: boolean;
}) {
  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-semibold leading-tight text-gray-900">
              {isAmount ? formatCurrency(value) : value.toLocaleString("en-IN")}
            </p>
            <p className="truncate text-xs text-gray-500">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
