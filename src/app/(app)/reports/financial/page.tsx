"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis, Area, AreaChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
import { DateRangeFilterBar, createDefaultDateRange, type DateRangeFilters } from "@/components/reports/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/reports/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import { apiRequest } from "@/lib/api/http";
import { TrendingUp, DollarSign, CreditCard, Loader2, ArrowUpRight, ArrowDownRight, Percent } from "lucide-react";

interface FinancialAnalytics {
  summary: {
    total_trips: number;
    total_consigner_amount: number;
    total_driver_payable: number;
    total_platform_revenue: number;
    avg_revenue_per_trip: number;
    avg_trip_value: number;
    revenue_margin_pct: number;
  };
  collections: {
    total_collected: number;
    advance_collected: number;
    final_collected: number;
    total_pending: number;
    completed_payments: number;
    pending_payments: number;
    failed_payments: number;
    total_billed: number;
    collection_rate: number;
    uncollected: number;
  };
  monthly_trend: Array<{ month: string; trips: number; consigner_total: number; driver_total: number; revenue: number }>;
  daily_trend: Array<{ date: string; trips: number; consigner_total: number; driver_total: number; revenue: number }>;
  status_breakdown: Array<{ status: string; count: number; amount: number }>;
  source_breakdown: Array<{ source: string; trips: number; consigner_total: number; revenue: number }>;
  top_trips: Array<{ trip_number: string; consigner_amount: number; driver_bid: number; platform_revenue: number; trip_status: string; trip_date: string }>;
}

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const revenueConfig = { revenue: { label: "Revenue", color: "#10b981" }, consigner_total: { label: "Consigner", color: "#3b82f6" }, driver_total: { label: "Driver", color: "#f59e0b" } } satisfies ChartConfig;
const areaConfig = { revenue: { label: "Revenue", color: "#10b981" } } satisfies ChartConfig;
const pieConfig = { value: { label: "Amount", color: "#6366f1" } } satisfies ChartConfig;

function prettify(s: string) { return s.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" "); }

export default function FinancialReportPage() {
  const [filters, setFilters] = useState<DateRangeFilters>(() => {
    const d = createDefaultDateRange();
    // Default to 90 days for financial view
    const from = new Date();
    from.setDate(from.getDate() - 89);
    return { from: from.toISOString().split("T")[0], to: d.to };
  });

  const query = useQuery({
    queryKey: ["reports", "financial-analytics", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      return apiRequest<FinancialAnalytics>(`/api/reports/financial-analytics?${params}`);
    },
  });

  const data = query.data;
  const s = data?.summary;
  const c = data?.collections;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Financial Analytics" description="Revenue, collections, and trip economics" />
      <DateRangeFilterBar filters={filters} onChange={setFilters} />

      {query.isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : query.isError ? (
        <Card><CardContent className="p-4 text-sm text-red-600">{query.error instanceof Error ? query.error.message : "Error"}</CardContent></Card>
      ) : !data || !s ? (
        <Card><CardContent className="p-6 text-center text-sm text-gray-500">No financial data for selected period</CardContent></Card>
      ) : (
        <>
          {/* Revenue KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Platform Revenue" value={formatCurrency(s.total_platform_revenue)} helper={`${s.revenue_margin_pct}% margin`} />
            <KpiCard label="Consigner Billed" value={formatCurrency(s.total_consigner_amount)} helper={`${s.total_trips} trips`} />
            <KpiCard label="Driver Payable" value={formatCurrency(s.total_driver_payable)} />
            <KpiCard label="Avg Revenue/Trip" value={formatCurrency(s.avg_revenue_per_trip)} helper={`Avg trip: ${formatCurrency(s.avg_trip_value)}`} />
          </div>

          {/* Collection KPIs */}
          {c && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Total Collected" value={formatCurrency(c.total_collected)} helper={`${c.completed_payments} payments`} />
              <KpiCard label="Advance Collected" value={formatCurrency(c.advance_collected)} />
              <KpiCard label="Balance Collected" value={formatCurrency(c.final_collected)} />
              <KpiCard label="Collection Rate" value={`${c.collection_rate}%`}
                helper={c.uncollected > 0 ? `${formatCurrency(c.uncollected)} uncollected` : "Fully collected"} />
            </div>
          )}

          {/* Charts Row 1: Revenue Trend + Revenue Breakdown */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Revenue Area Chart */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-600" /> Revenue Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.daily_trend.length > 0 ? (
                  <ChartContainer config={areaConfig} className="h-[250px]">
                    <AreaChart data={data.daily_trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={10}
                        tickFormatter={(v) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} />
                      <YAxis tickLine={false} axisLine={false} fontSize={10}
                        tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                      <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
                      <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#revGradient)" />
                    </AreaChart>
                  </ChartContainer>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-10">No daily data</p>
                )}
              </CardContent>
            </Card>

            {/* Money Flow Breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-gray-500" /> Money Flow
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <FlowBar label="Consigner Billed" amount={s.total_consigner_amount} total={s.total_consigner_amount} color="bg-blue-500" />
                  <FlowBar label="Driver Payable" amount={s.total_driver_payable} total={s.total_consigner_amount} color="bg-amber-500" />
                  <FlowBar label="Platform Revenue" amount={s.total_platform_revenue} total={s.total_consigner_amount} color="bg-emerald-500" />
                  <div className="pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Revenue Margin</span>
                      <span className="text-lg font-bold text-emerald-700">{s.revenue_margin_pct}%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row 2: Monthly Bar + Source + Status */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Monthly Revenue Bar Chart */}
            {data.monthly_trend.length > 0 && (
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Monthly Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={revenueConfig} className="h-[220px]">
                    <BarChart data={data.monthly_trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={10} />
                      <YAxis tickLine={false} axisLine={false} fontSize={10} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                      <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Bar dataKey="consigner_total" fill="var(--color-consigner_total)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="driver_total" fill="var(--color-driver_total)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* Source Breakdown */}
            {data.source_breakdown.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Revenue by Source</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={pieConfig} className="h-[180px]">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
                      <Pie data={data.source_breakdown.map((s, i) => ({ ...s, name: s.source, value: s.revenue, fill: PIE_COLORS[i] }))}
                        dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3}>
                        {data.source_breakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="space-y-1.5 mt-2">
                    {data.source_breakdown.map((s, i) => (
                      <div key={s.source} className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-gray-600">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                          {s.source}
                        </span>
                        <span className="font-medium text-gray-900">{formatCurrency(s.revenue)} ({s.trips} trips)</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Top Earning Trips Table */}
          {data.top_trips.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Revenue Trips</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Trip</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Consigner Paid</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Driver Bid</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Revenue</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.top_trips.map((t) => {
                      const marginPct = t.consigner_amount > 0 ? ((t.platform_revenue / t.consigner_amount) * 100).toFixed(1) : "0";
                      return (
                        <tr key={t.trip_number} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3">
                            <span className="font-medium text-gray-900">{t.trip_number}</span>
                            <span className="text-[11px] text-gray-400 ml-2">{t.trip_date}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(t.consigner_amount)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(t.driver_bid)}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-semibold text-emerald-700">{formatCurrency(t.platform_revenue)}</span>
                            <span className="text-[11px] text-gray-400 ml-1">({marginPct}%)</span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="border-0 text-[10px] bg-gray-100 text-gray-600">
                              {prettify(t.trip_status)}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Trip Status Breakdown */}
          {data.status_breakdown.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Trip Value by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {data.status_breakdown.map((sb) => (
                    <div key={sb.status} className="rounded-lg bg-gray-50 p-3">
                      <p className="text-[11px] text-gray-400 uppercase">{prettify(sb.status)}</p>
                      <p className="text-lg font-semibold text-gray-900 mt-0.5">{sb.count}</p>
                      <p className="text-xs text-gray-500">{formatCurrency(sb.amount)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function FlowBar({ label, amount, total, color }: { label: string; amount: number; total: number; color: string }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-600">{label}</span>
        <span className="text-sm font-medium text-gray-900">{formatCurrency(amount)}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-gray-400 mt-0.5">{pct.toFixed(1)}% of total</p>
    </div>
  );
}
