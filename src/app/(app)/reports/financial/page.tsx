"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis, Area, AreaChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
import { DateRangeFilterBar, createDefaultDateRange, type DateRangeFilters } from "@/components/reports/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/reports/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/formatters";
import { apiRequest } from "@/lib/api/http";
import { TrendingUp, DollarSign, Loader2, Banknote, Receipt, Building2 } from "lucide-react";

interface FinancialData {
  period: { from: string; to: string };
  summary: {
    total_trips: number; total_billed: number; total_driver_cost: number;
    total_revenue: number; avg_revenue_per_trip: number; margin_pct: number;
    erp_revenue: number; app_revenue: number; erp_billed: number; app_billed: number;
    erp_trips: number; app_trips: number;
    total_holding_driver: number;
    total_holding_consigner: number;
    total_holding_margin: number;
  };
  receivables: { total_outstanding: number; total_overdue: number; collected_in_period: number };
  driver_payments: { erp_paid: number; erp_pending: number; app_paid: number; app_pending: number };
  daily_trend: Array<{ date: string; trips: number; billed: number; driver_cost: number; revenue: number; erp_revenue: number | null; app_revenue: number | null }>;
  monthly_trend: Array<{ month: string; trips: number; billed: number; driver_cost: number; revenue: number; erp_revenue: number | null; app_revenue: number | null }>;
  source_breakdown: Array<{ source: string; trips: number; billed: number; driver_cost: number; revenue: number }>;
  status_breakdown: Array<{ status: string; count: number; billed: number; revenue: number }>;
  top_trips: Array<{ trip_number: string; consigner_name: string; consigner_billed: number; driver_cost: number; revenue: number; margin_pct: number; trip_status: string; trip_date: string; is_erp: boolean }>;
}

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];
const trendConfig = { erp_revenue: { label: "ERP", color: "#6366f1" }, app_revenue: { label: "App", color: "#3b82f6" } } satisfies ChartConfig;
const barConfig = { billed: { label: "Billed", color: "#3b82f6" }, driver_cost: { label: "Driver Cost", color: "#f59e0b" }, revenue: { label: "Revenue", color: "#10b981" } } satisfies ChartConfig;
const pieConfig = { value: { label: "Amount" } } satisfies ChartConfig;

function prettify(s: string) { return s.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" "); }

type ViewTab = "overview" | "erp" | "app";

export default function FinancialReportPage() {
  const [tab, setTab] = useState<ViewTab>("overview");
  const [filters, setFilters] = useState<DateRangeFilters>(() => {
    const d = createDefaultDateRange();
    const from = new Date(); from.setDate(from.getDate() - 89);
    return { from: from.toISOString().split("T")[0], to: d.to };
  });

  const query = useQuery({
    queryKey: ["reports", "financial-analytics", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      return apiRequest<FinancialData>(`/api/reports/financial-analytics?${params}`);
    },
    staleTime: 60_000,
  });

  const data = query.data;
  const s = data?.summary;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Financial Reports" description="Revenue, margins, receivables, and trip economics" />
      <DateRangeFilterBar filters={filters} onChange={setFilters} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as ViewTab)}>
        <TabsList className="grid h-auto w-full grid-cols-3 bg-transparent p-0">
          {(["overview", "erp", "app"] as const).map((t) => (
            <TabsTrigger key={t} value={t}
              className="rounded-none border-b-2 border-transparent py-2 text-xs data-[state=active]:border-gray-900 data-[state=active]:bg-transparent capitalize">
              {t === "overview" ? "Overview" : t === "erp" ? "ERP Trips" : "App Trips"}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {query.isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : query.isError ? (
        <Card><CardContent className="p-4 text-sm text-red-600">{query.error instanceof Error ? query.error.message : "Error"}</CardContent></Card>
      ) : !data || !s ? (
        <Card><CardContent className="p-6 text-center text-sm text-gray-500">No financial data for selected period</CardContent></Card>
      ) : tab === "overview" ? (
        <OverviewTab data={data} />
      ) : tab === "erp" ? (
        <ErpTab data={data} />
      ) : (
        <AppTab data={data} />
      )}
    </div>
  );
}

/* ─── Overview Tab ─── */
function OverviewTab({ data }: { data: FinancialData }) {
  const s = data.summary;
  const r = data.receivables;

  return (
    <div className="space-y-4">
      {/* Revenue KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Revenue" value={formatCurrency(s.total_revenue)} helper={`${s.margin_pct}% margin`} />
        <KpiCard label="Total Billed" value={formatCurrency(s.total_billed)} helper={`${s.total_trips} trips`} />
        <KpiCard label="Driver Cost" value={formatCurrency(s.total_driver_cost)} />
        <KpiCard label="Avg Revenue/Trip" value={formatCurrency(s.avg_revenue_per_trip)} helper={`${s.margin_pct}% avg margin`} />
      </div>

      {/* Source Split KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="ERP Revenue" value={formatCurrency(s.erp_revenue)} helper={`${s.erp_trips} trips`} />
        <KpiCard label="App Revenue" value={formatCurrency(s.app_revenue)} helper={`${s.app_trips} trips`} />
        <KpiCard label="Outstanding Receivables" value={formatCurrency(r.total_outstanding)} helper={r.total_overdue > 0 ? `${formatCurrency(r.total_overdue)} overdue` : "None overdue"} />
        <KpiCard label="Collected (Period)" value={formatCurrency(r.collected_in_period)} />
      </div>

      {/* Holding Charges KPIs — shown only when any holding was recorded. */}
      {(s.total_holding_consigner > 0 || s.total_holding_driver > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <KpiCard
            label="Holding — Billed to Consigners"
            value={formatCurrency(s.total_holding_consigner)}
            helper="included in total billed"
          />
          <KpiCard
            label="Holding — Paid to Drivers"
            value={formatCurrency(s.total_holding_driver)}
            helper="included in driver cost"
          />
          <KpiCard
            label="Holding — Margin"
            value={formatCurrency(s.total_holding_margin)}
            helper={s.total_holding_margin >= 0 ? "contribution to revenue" : "negative contribution"}
          />
        </div>
      )}

      {/* Revenue Trend */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /> Revenue Trend (ERP + App)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.daily_trend.length > 0 ? (
              <ChartContainer config={trendConfig} className="h-[250px]">
                <AreaChart data={data.daily_trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="erpG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient>
                    <linearGradient id="appG" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={10}
                    tickFormatter={(v) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} />
                  <YAxis tickLine={false} axisLine={false} fontSize={10} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v ?? 0))} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Area type="monotone" dataKey="erp_revenue" stroke="#6366f1" strokeWidth={2} fill="url(#erpG)" connectNulls />
                  <Area type="monotone" dataKey="app_revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#appG)" connectNulls />
                </AreaChart>
              </ChartContainer>
            ) : <p className="text-sm text-gray-400 text-center py-10">No daily data</p>}
          </CardContent>
        </Card>

        {/* Source Pie */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue by Source</CardTitle></CardHeader>
          <CardContent>
            {data.source_breakdown.length > 0 ? (
              <>
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
              </>
            ) : <p className="text-sm text-gray-400 text-center py-10">No data</p>}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Bar */}
      {data.monthly_trend.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={barConfig} className="h-[220px]">
              <BarChart data={data.monthly_trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={10} />
                <YAxis tickLine={false} axisLine={false} fontSize={10} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="billed" fill="var(--color-billed)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="driver_cost" fill="var(--color-driver_cost)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── ERP Tab ─── */
function ErpTab({ data }: { data: FinancialData }) {
  const s = data.summary;
  const r = data.receivables;
  const erpTrips = data.top_trips.filter((t) => t.is_erp);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="ERP Billed" value={formatCurrency(s.erp_billed)} helper={`${s.erp_trips} trips`} />
        <KpiCard label="ERP Revenue" value={formatCurrency(s.erp_revenue)}
          helper={s.erp_billed > 0 ? `${((s.erp_revenue / s.erp_billed) * 100).toFixed(1)}% margin` : ""} />
        <KpiCard label="Paid to Drivers" value={formatCurrency(data.driver_payments.erp_paid)}
          helper={data.driver_payments.erp_pending > 0 ? `${formatCurrency(data.driver_payments.erp_pending)} pending` : ""} />
        <KpiCard label="Outstanding" value={formatCurrency(r.total_outstanding)}
          helper={r.total_overdue > 0 ? `${formatCurrency(r.total_overdue)} overdue` : "None overdue"} />
      </div>

      {/* ERP Trip Economics Table */}
      {erpTrips.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4 text-indigo-600" /> ERP Trip Economics</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Trip</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Consigner</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Billed</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Driver Cost</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Margin</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {erpTrips.map((t) => (
                    <tr key={t.trip_number} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3"><span className="font-medium text-gray-900">{t.trip_number}</span><span className="text-[11px] text-gray-400 ml-2">{t.trip_date}</span></td>
                      <td className="px-4 py-3 text-gray-700">{t.consigner_name}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(t.consigner_billed)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(t.driver_cost)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-emerald-700">{formatCurrency(t.revenue)}</span>
                        <span className="text-[11px] text-gray-400 ml-1">({t.margin_pct}%)</span>
                      </td>
                      <td className="px-4 py-3"><Badge variant="outline" className="border-0 text-[10px] bg-gray-100 text-gray-600">{prettify(t.trip_status)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {erpTrips.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-gray-500">No ERP trips in selected period</CardContent></Card>
      )}
    </div>
  );
}

/* ─── App Tab ─── */
function AppTab({ data }: { data: FinancialData }) {
  const s = data.summary;
  const dp = data.driver_payments;
  const appTrips = data.top_trips.filter((t) => !t.is_erp);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="App Billed" value={formatCurrency(s.app_billed)} helper={`${s.app_trips} trips`} />
        <KpiCard label="Commission Revenue" value={formatCurrency(s.app_revenue)}
          helper={s.app_billed > 0 ? `${((s.app_revenue / s.app_billed) * 100).toFixed(1)}% avg commission` : ""} />
        <KpiCard label="Paid to Drivers" value={formatCurrency(dp.app_paid)} />
        <KpiCard label="Pending Payouts" value={formatCurrency(dp.app_pending)} />
      </div>

      {/* App Trip Economics Table */}
      {appTrips.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Banknote className="h-4 w-4 text-blue-600" /> App Trip Economics</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Trip</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Consigner</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Consigner Paid</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Driver Amount</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Commission</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {appTrips.map((t) => (
                    <tr key={t.trip_number} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3"><span className="font-medium text-gray-900">{t.trip_number}</span><span className="text-[11px] text-gray-400 ml-2">{t.trip_date}</span></td>
                      <td className="px-4 py-3 text-gray-700">{t.consigner_name}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(t.consigner_billed)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(t.driver_cost)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-emerald-700">{formatCurrency(t.revenue)}</span>
                        <span className="text-[11px] text-gray-400 ml-1">({t.margin_pct}%)</span>
                      </td>
                      <td className="px-4 py-3"><Badge variant="outline" className="border-0 text-[10px] bg-gray-100 text-gray-600">{prettify(t.trip_status)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {appTrips.length === 0 && (
        <Card><CardContent className="p-6 text-center text-sm text-gray-500">No App trips in selected period</CardContent></Card>
      )}
    </div>
  );
}

/* ─── Helper ─── */
function FlowBar({ label, amount, total, color }: { label: string; amount: number; total: number; color: string }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-medium text-gray-900">{formatCurrency(amount)}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}
