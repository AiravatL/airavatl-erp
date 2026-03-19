"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CreditCard, MapPin, PackagePlus, Truck, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { DateRangeFilterBar, createDefaultDateRange, type DateRangeFilters } from "@/components/reports/filter-bar";
import { KpiCard } from "@/components/reports/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/formatters";
import { getAppOverview } from "@/lib/api/app-reports";
import { queryKeys } from "@/lib/query/keys";

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];

const USERS_CONFIG = { value: { label: "Users", color: "#6366f1" } } satisfies ChartConfig;
const TRIPS_CONFIG = { value: { label: "Count", color: "#3b82f6" } } satisfies ChartConfig;
const PAYMENTS_CONFIG = { value: { label: "Amount", color: "#111827" } } satisfies ChartConfig;

const MODULE_CARDS = [
  { label: "Auctions", href: "/reports/auctions", icon: PackagePlus, description: "Delivery request and bidding analytics" },
  { label: "Trips", href: "/reports/trips", icon: Truck, description: "App trip data and status tracking" },
  { label: "Financial", href: "/reports/financial", icon: CreditCard, description: "Payments and driver payouts" },
  { label: "Drivers", href: "/reports/drivers", icon: MapPin, description: "Driver locations and availability" },
  { label: "Customers", href: "/reports/customers", icon: Users, description: "Consigner analytics and credit health" },
];

export default function ReportsPage() {
  const [filters, setFilters] = useState<DateRangeFilters>(createDefaultDateRange);

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
