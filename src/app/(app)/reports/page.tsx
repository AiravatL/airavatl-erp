"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Coins, Fuel, Receipt, TrendingUp, Truck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ReportPageChrome } from "@/components/reports/report-page-chrome";
import { createDefaultReportFilters } from "@/components/reports/filter-bar";
import { KpiCard } from "@/components/reports/kpi-card";
import { REPORT_BASELINE_STATUS } from "@/components/reports/constants";
import { ReportStatusBadge } from "@/components/reports/report-status-badge";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/formatters";
import { getReportOverview, type ReportFilters } from "@/lib/api/reports";
import { queryKeys } from "@/lib/query/keys";

const REPORT_CARDS = [
  {
    key: "tripPnl" as const,
    title: "Trip P&L Report",
    description: "Leased trip profitability analysis with expected vs actual costs",
    href: "/reports/trip-pnl",
    icon: TrendingUp,
  },
  {
    key: "fuelVariance" as const,
    title: "Fuel Variance Report",
    description: "Fuel consumption analysis against expected ranges per route",
    href: "/reports/fuel-variance",
    icon: Fuel,
  },
  {
    key: "expenseSummary" as const,
    title: "Expense Summary",
    description: "Category-wise expense breakdown with cap analysis",
    href: "/reports/expense-summary",
    icon: Receipt,
  },
  {
    key: "utilization" as const,
    title: "Utilization Report",
    description: "Leased fleet utilization, idle days, and trip frequency",
    href: "/reports/utilization",
    icon: Truck,
  },
  {
    key: "salesPerformance" as const,
    title: "Sales Performance",
    description: "Trip volume, revenue, and collection metrics by salesperson",
    href: "/reports/sales-performance",
    icon: BarChart3,
  },
  {
    key: "receivablesAging" as const,
    title: "Receivables Aging",
    description: "Outstanding receivables with aging analysis by customer",
    href: "/reports/receivables-aging",
    icon: Coins,
  },
];

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

const TREND_CONFIG = {
  revenue: { label: "Revenue", color: "#3b82f6" },
  expenses: { label: "Expenses", color: "#f97316" },
  trips: { label: "Trips", color: "#10b981" },
} satisfies ChartConfig;

const STAGE_CONFIG = {
  count: { label: "Trips", color: "#6366f1" },
} satisfies ChartConfig;

const PAYMENT_CONFIG = {
  amount: { label: "Amount", color: "#111827" },
} satisfies ChartConfig;

function prettify(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function ReportsPage() {
  const [filters, setFilters] = useState<ReportFilters>(createDefaultReportFilters());

  const overviewQuery = useQuery({
    queryKey: queryKeys.reportOverview(filters),
    queryFn: () => getReportOverview(filters),
  });

  const overview = overviewQuery.data;

  const statuses = overview?.reportStatus
    ? {
        tripPnl: overview.reportStatus.tripPnl,
        fuelVariance: overview.reportStatus.fuelVariance,
        expenseSummary: overview.reportStatus.expenseSummary,
        utilization: overview.reportStatus.utilization,
        salesPerformance: overview.reportStatus.salesPerformance,
        receivablesAging: overview.reportStatus.receivablesAging,
      }
    : REPORT_BASELINE_STATUS;

  const paymentMix = useMemo(
    () =>
      (overview?.paymentStatusMix ?? []).map((item, index) => ({
        ...item,
        label: prettify(item.status),
        fill: PIE_COLORS[index % PIE_COLORS.length],
      })),
    [overview?.paymentStatusMix],
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <ReportPageChrome
        title="Reports Overview"
        description="High-level operational and financial signals with drilldowns by category."
        filters={filters}
        onFiltersChange={setFilters}
        dataQuality={overview?.dataQuality}
      />

      {overviewQuery.isLoading ? (
        <Card>
          <CardContent className="p-4 text-sm text-gray-500">Loading report overview...</CardContent>
        </Card>
      ) : overviewQuery.isError ? (
        <Card>
          <CardContent className="p-4 text-sm text-red-600">
            {overviewQuery.error instanceof Error ? overviewQuery.error.message : "Unable to load reports overview"}
          </CardContent>
        </Card>
      ) : !overview ? (
        <EmptyState
          icon={BarChart3}
          title="No report data"
          description="No reports data is available for the selected filters."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <KpiCard label="Total Trips" value={overview.kpis.totalTrips.toLocaleString("en-IN")} />
            <KpiCard label="Closed Trips" value={overview.kpis.closedTrips.toLocaleString("en-IN")} />
            <KpiCard label="Revenue" value={formatCurrency(overview.kpis.revenue)} />
            <KpiCard label="Total Expenses" value={formatCurrency(overview.kpis.totalExpenses)} />
            <KpiCard label="Gross Margin" value={`${overview.kpis.grossMarginPct.toFixed(2)}%`} />
            <KpiCard label="Outstanding Receivables" value={formatCurrency(overview.kpis.outstandingReceivables)} />
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Trips, Revenue and Expenses Trend</CardTitle>
                <CardDescription className="text-xs">Monthly trend in selected window</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={TREND_CONFIG} className="h-[260px]">
                  <BarChart data={overview.trend} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => {
                            if (name === "Trips") return Number(value).toLocaleString("en-IN");
                            return formatCurrency(Number(value));
                          }}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} />
                    <Line dataKey="trips" stroke="var(--color-trips)" strokeWidth={2.2} dot={false} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Payment Status Mix</CardTitle>
                <CardDescription className="text-xs">Amount by payment request status</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={PAYMENT_CONFIG} className="h-[260px]">
                  <PieChart>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, _name, item) => {
                            const label = prettify(String(item.payload?.status ?? ""));
                            return `${label}: ${formatCurrency(Number(value))}`;
                          }}
                        />
                      }
                    />
                    <Pie
                      data={paymentMix}
                      dataKey="amount"
                      nameKey="label"
                      innerRadius={56}
                      outerRadius={88}
                      paddingAngle={2}
                    >
                      {paymentMix.map((entry, index) => (
                        <Cell key={`${entry.status}-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="mt-2 space-y-1.5 text-xs text-gray-600">
                  {paymentMix.map((item) => (
                    <div key={item.status} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                        {item.label}
                      </div>
                      <span className="font-medium text-gray-800">{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Trip Stage Distribution</CardTitle>
                <CardDescription className="text-xs">Current stage mix in selected dataset</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={STAGE_CONFIG} className="h-[250px]">
                  <BarChart data={overview.stageMix.map((item) => ({ ...item, stageLabel: prettify(item.stage) }))} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="stageLabel" tickLine={false} axisLine={false} fontSize={10} interval={0} angle={-12} textAnchor="end" height={48} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Report Modules</CardTitle>
                <CardDescription className="text-xs">Open detailed report pages</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {REPORT_CARDS.map((report) => {
                  const Icon = report.icon;
                  return (
                    <Link key={report.href} href={report.href} className="flex items-start justify-between gap-3 rounded-md border border-gray-200 p-2.5 transition-colors hover:bg-gray-50">
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 rounded-md bg-gray-100 p-1.5 text-gray-700">
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{report.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{report.description}</p>
                        </div>
                      </div>
                      <ReportStatusBadge status={statuses[report.key]} />
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="flex items-center justify-between gap-2 p-3">
              <p className="text-xs text-gray-500">Open each report for drilldown table and CSV export.</p>
              <Button size="sm" className="h-8 text-xs" asChild>
                <Link href="/reports/trip-pnl">Open Reports</Link>
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
