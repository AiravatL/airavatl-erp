"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CreditCard, Users, LineChart as LineChartIcon, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { DateRangeFilterBar, createDefaultDateRange, type DateRangeFilters } from "@/components/reports/filter-bar";
import { KpiCard } from "@/components/reports/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { getAppOverview, getOperationsHealth, type OperationsHealth } from "@/lib/api/app-reports";
import { queryKeys } from "@/lib/query/keys";

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

const USERS_CONFIG = { value: { label: "Users", color: "#6366f1" } } satisfies ChartConfig;
const TRIPS_CONFIG = { value: { label: "Count", color: "#3b82f6" } } satisfies ChartConfig;
const PAYMENTS_CONFIG = { value: { label: "Amount", color: "#111827" } } satisfies ChartConfig;

const MODULE_CARDS = [
  { label: "Analytics", href: "/reports/analytics", icon: LineChartIcon, description: "Auction + trip funnel and trends" },
  { label: "Financial", href: "/reports/financial", icon: CreditCard, description: "Payments and driver payouts" },
  { label: "Customers", href: "/reports/customers", icon: Users, description: "Consigner analytics and credit health" },
];

export default function ReportsPage() {
  const [filters, setFilters] = useState<DateRangeFilters>(createDefaultDateRange);

  const healthQuery = useQuery({
    queryKey: queryKeys.operationsHealth,
    queryFn: getOperationsHealth,
    refetchInterval: 60_000, // refresh every minute — these are point-in-time signals
  });

  const overviewQuery = useQuery({
    queryKey: queryKeys.appOverview(filters),
    queryFn: () => getAppOverview(filters),
  });

  const overview = overviewQuery.data;

  const tripsPie = useMemo(
    () => (overview?.tripsByStatus ?? []).map((item, i) => ({ ...item, fill: PIE_COLORS[i % PIE_COLORS.length] })),
    [overview?.tripsByStatus],
  );

  const paymentsPie = useMemo(
    () => (overview?.paymentsByStatus ?? []).map((item, i) => ({ ...item, fill: PIE_COLORS[i % PIE_COLORS.length] })),
    [overview?.paymentsByStatus],
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Reports Overview" description="Platform metrics and app data analytics" />

      <OperationsHealthSection health={healthQuery.data} isLoading={healthQuery.isLoading} />

      <DateRangeFilterBar filters={filters} onChange={setFilters} />

      {overviewQuery.isLoading ? (
        <Card><CardContent className="p-4 text-sm text-gray-500">Loading overview...</CardContent></Card>
      ) : overviewQuery.isError ? (
        <Card><CardContent className="p-4 text-sm text-red-600">
          {overviewQuery.error instanceof Error ? overviewQuery.error.message : "Unable to load overview"}
        </CardContent></Card>
      ) : !overview ? (
        <EmptyState icon={BarChart3} title="No data" description="No data available for selected period." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Total Users" value={overview.metrics.totalUsers.toLocaleString("en-IN")} />
            <KpiCard label="New Users" value={overview.metrics.newUsers.toLocaleString("en-IN")} />
            <KpiCard label="Delivery Requests" value={overview.metrics.deliveryRequests.toLocaleString("en-IN")} />
            <KpiCard label="Trips Created" value={overview.metrics.tripsCreated.toLocaleString("en-IN")} />
            <KpiCard label="Live Drivers" value={overview.metrics.liveDrivers.toLocaleString("en-IN")} />
            <KpiCard label="Payments Count" value={overview.metrics.paymentsCount.toLocaleString("en-IN")} />
            <KpiCard label="Payments Volume" value={formatCurrency(overview.metrics.paymentsVolume)} />
            <KpiCard label="Platform Revenue" value={formatCurrency(overview.metrics.platformRevenue)} />
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            {/* Users by Type */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Users by Type</CardTitle>
                <CardDescription className="text-xs">Registration breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={USERS_CONFIG} className="h-[220px]">
                  <BarChart data={overview.usersByType} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Trips by Status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Trips by Status</CardTitle>
                <CardDescription className="text-xs">Current status distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={TRIPS_CONFIG} className="h-[220px]">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie data={tripsPie} dataKey="value" nameKey="label" innerRadius={48} outerRadius={76} paddingAngle={2}>
                      {tripsPie.map((entry, i) => <Cell key={`t-${i}`} fill={entry.fill} />)}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <PieLegend items={tripsPie} />
              </CardContent>
            </Card>

            {/* Payments by Status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Payments by Status</CardTitle>
                <CardDescription className="text-xs">Payment volume by status</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={PAYMENTS_CONFIG} className="h-[220px]">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie data={paymentsPie} dataKey="value" nameKey="label" innerRadius={48} outerRadius={76} paddingAngle={2}>
                      {paymentsPie.map((entry, i) => <Cell key={`p-${i}`} fill={entry.fill} />)}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <PieLegend items={paymentsPie} />
              </CardContent>
            </Card>
          </div>

          {/* Module cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {MODULE_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <Link key={card.href} href={card.href} className="block">
                  <Card className="h-full transition-colors hover:bg-gray-50">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2.5">
                        <div className="rounded-md bg-gray-100 p-1.5 text-gray-700">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{card.label}</p>
                          <p className="text-[11px] text-gray-500">{card.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

type HealthSeverity = "ok" | "warn" | "critical";

interface HealthCardConfig {
  label: string;
  description: string;
  href?: string;
  // ok = expected when 0; warn = action recommended; critical = sanity-check that
  // SHOULD always be 0 (a non-zero means a constraint was bypassed somehow).
  severity: (count: number) => HealthSeverity;
}

const HEALTH_CARDS: { key: keyof Omit<OperationsHealth, "asOf">; config: HealthCardConfig }[] = [
  {
    key: "stuckDriverPayouts",
    config: {
      label: "Stuck driver payouts",
      description: "Processing >6h. Resolves on RazorpayX webhook or polling.",
      href: "/payments",
      severity: (n) => (n === 0 ? "ok" : "warn"),
    },
  },
  {
    key: "partnersPendingOnboarding",
    config: {
      label: "Partners pending onboarding",
      description: "KYC verified but RazorpayX not yet linked. Click Retry on their verification page.",
      href: "/verification",
      severity: (n) => (n === 0 ? "ok" : "warn"),
    },
  },
  {
    key: "tripsOverdueForPayment",
    config: {
      label: "Trips overdue (>24h)",
      description: "Trips waiting on accounts to mark advance/final paid.",
      href: "/payments",
      severity: (n) => (n === 0 ? "ok" : "warn"),
    },
  },
  {
    key: "pushQueueBacklog",
    config: {
      label: "Push queue backlog",
      description: "Pending notifications. Cron should drain this every minute.",
      severity: (n) => (n === 0 ? "ok" : n > 100 ? "critical" : "warn"),
    },
  },
  {
    key: "dpsValidatedWithoutRazorpayx",
    config: {
      label: "Validated w/o RazorpayX (constraint check)",
      description: "Should always be 0. CHECK constraint enforces this. Non-zero = constraint bypassed.",
      severity: (n) => (n === 0 ? "ok" : "critical"),
    },
  },
  {
    key: "tripsAmountDrift",
    config: {
      label: "Trip amount drift (constraint check)",
      description: "Should always be 0. advance + final must equal total. Non-zero = constraint bypassed.",
      severity: (n) => (n === 0 ? "ok" : "critical"),
    },
  },
];

function OperationsHealthSection({ health, isLoading }: { health: OperationsHealth | undefined; isLoading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4 text-gray-700" />
            Operations Health
          </CardTitle>
          <CardDescription className="text-xs">
            Point-in-time signals admins should act on. Refreshes every minute.
          </CardDescription>
        </div>
        {health?.asOf ? (
          <span className="text-[11px] text-gray-400">
            as of {new Date(health.asOf).toLocaleTimeString()}
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        {isLoading && !health ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : !health ? (
          <p className="text-xs text-red-600">Unable to load operations health.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
            {HEALTH_CARDS.map(({ key, config }) => {
              const value = health[key] as number;
              const severity = config.severity(value);
              return (
                <HealthCard key={String(key)} value={value} severity={severity} config={config} />
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HealthCard({
  value,
  severity,
  config,
}: {
  value: number;
  severity: HealthSeverity;
  config: HealthCardConfig;
}) {
  const tone = {
    ok: "border-emerald-200 bg-emerald-50/40",
    warn: "border-amber-300 bg-amber-50",
    critical: "border-red-300 bg-red-50",
  }[severity];

  const valueTone = {
    ok: "text-emerald-700",
    warn: "text-amber-800",
    critical: "text-red-700",
  }[severity];

  const Icon = severity === "ok" ? CheckCircle2 : AlertTriangle;
  const iconTone = {
    ok: "text-emerald-600",
    warn: "text-amber-600",
    critical: "text-red-600",
  }[severity];

  const inner = (
    <div className={cn("rounded-lg border p-3 transition-colors", tone, config.href ? "hover:bg-opacity-80" : "")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-600">{config.label}</p>
          <p className={cn("mt-1 text-2xl font-semibold leading-none", valueTone)}>{value.toLocaleString("en-IN")}</p>
        </div>
        <Icon className={cn("h-4 w-4 shrink-0", iconTone)} />
      </div>
      <p className="mt-2 text-[10px] leading-tight text-gray-500">{config.description}</p>
    </div>
  );

  return config.href ? (
    <Link href={config.href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function PieLegend({ items }: { items: { label: string; value: number; fill: string }[] }) {
  return (
    <div className="mt-2 space-y-1 text-xs text-gray-600">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
            {item.label}
          </div>
          <span className="font-medium text-gray-800">{item.value.toLocaleString("en-IN")}</span>
        </div>
      ))}
    </div>
  );
}
