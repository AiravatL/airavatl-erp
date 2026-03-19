"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { Truck, Search } from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/reports/kpi-card";
import { CsvExportButton, type CsvColumn } from "@/components/reports/csv-export-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { formatDate, formatCurrency } from "@/lib/formatters";
import { listAppTrips, type AppTripItem, type AppTripFilters } from "@/lib/api/app-reports";
import { queryKeys } from "@/lib/query/keys";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";

const col = createColumnHelper<AppTripItem>();

const columns = [
  col.accessor("tripNumber", {
    header: "Trip #",
    cell: (info) => <span className="font-medium text-gray-900">{info.getValue()}</span>,
  }),
  col.accessor("requestNumber", {
    header: "Request #",
    cell: (info) => info.getValue() ?? <span className="text-gray-300">—</span>,
  }),
  col.accessor("consignerName", { header: "Consigner" }),
  col.accessor("driverName", {
    header: "Driver",
    cell: (info) => info.getValue() ?? <span className="text-gray-300">—</span>,
  }),
  col.display({
    id: "route",
    header: "Route",
    cell: (info) => (
      <span className="text-gray-600">
        {info.row.original.pickupCity} → {info.row.original.deliveryCity}
      </span>
    ),
  }),
  col.accessor("tripAmount", {
    header: "Amount",
    cell: (info) => formatCurrency(info.getValue()),
  }),
  col.accessor("status", {
    header: "Status",
    cell: (info) => <TripStatusBadge status={info.getValue()} />,
  }),
  col.accessor("createdAt", {
    header: "Created",
    cell: (info) => <span className="text-gray-500 text-xs">{formatDate(info.getValue())}</span>,
  }),
];

const csvColumns: CsvColumn<AppTripItem>[] = [
  { key: "tripNumber", header: "Trip #", value: (r) => r.tripNumber },
  { key: "requestNumber", header: "Request #", value: (r) => r.requestNumber },
  { key: "consignerName", header: "Consigner", value: (r) => r.consignerName },
  { key: "driverName", header: "Driver", value: (r) => r.driverName },
  { key: "pickupCity", header: "Pickup", value: (r) => r.pickupCity },
  { key: "deliveryCity", header: "Delivery", value: (r) => r.deliveryCity },
  { key: "tripAmount", header: "Amount", value: (r) => r.tripAmount },
  { key: "status", header: "Status", value: (r) => r.status },
  { key: "createdAt", header: "Created", value: (r) => r.createdAt },
];

const TRIP_STATUSES = [
  "pending",
  "waiting_driver_acceptance",
  "driver_assigned",
  "en_route_to_pickup",
  "at_pickup",
  "loading",
  "in_transit",
  "at_delivery",
  "unloading",
  "completed",
  "cancelled",
  "driver_rejected",
];

export default function TripsReportPage() {
  const [filters, setFilters] = useState<AppTripFilters>({ limit: 100 });

  const query = useQuery({
    queryKey: queryKeys.appTrips(filters),
    queryFn: () => listAppTrips(filters),
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalAmount = items.reduce((sum, t) => sum + t.tripAmount, 0);
  const active = items.filter((t) => !["completed", "cancelled", "driver_rejected"].includes(t.status)).length;

  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() });

  const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];
  const statusChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of items) { map.set(t.status, (map.get(t.status) ?? 0) + 1); }
    return Array.from(map.entries()).map(([status, count], i) => ({
      name: prettify(status), value: count, fill: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [items]);

  const chartConfig = { value: { label: "Count", color: "#6366f1" } } satisfies ChartConfig;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Trip Analytics" description="App trip data and status tracking">
        <CsvExportButton fileName="trips-report.csv" rows={items} columns={csvColumns} />
      </PageHeader>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="Search..."
            value={filters.search ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value || undefined, offset: 0 }))}
            className="h-8 pl-8 text-sm"
            maxLength={FIELD_LIMITS.search}
          />
        </div>
        <Select value={filters.status ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "all" ? undefined : v, offset: 0 }))}>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {TRIP_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{prettify(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total Trips" value={total.toLocaleString("en-IN")} />
        <KpiCard label="Trip Volume" value={formatCurrency(totalAmount)} />
        <KpiCard label="Active" value={active.toLocaleString("en-IN")} />
        <KpiCard label="Completed" value={items.filter((t) => t.status === "completed").length.toLocaleString("en-IN")} />
      </div>

      {/* Status Chart */}
      {items.length > 0 && statusChart.length > 1 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-gray-900 mb-3">Status Distribution</p>
            <div className="flex items-center gap-6">
              <ChartContainer config={chartConfig} className="h-[180px] w-[180px] shrink-0">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie data={statusChart} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {statusChart.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {statusChart.map((s) => (
                  <span key={s.name} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.fill }} />
                    {s.name} ({s.value})
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <QueryState query={query} icon={Truck} emptyLabel="No trips found." />
      {items.length > 0 && (
        <>
          <div className="hidden sm:block">
            <Card><CardContent className="p-0"><DataTable table={table} /></CardContent></Card>
          </div>
          <div className="sm:hidden space-y-2">
            {items.map((t) => (
              <Card key={t.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t.tripNumber}</p>
                      <p className="text-xs text-gray-500">{t.consignerName}</p>
                      <p className="text-[11px] text-gray-400">{t.pickupCity} → {t.deliveryCity}</p>
                    </div>
                    <TripStatusBadge status={t.status} />
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-gray-500">
                    <span>{formatCurrency(t.tripAmount)}</span>
                    {t.driverName && <span>{t.driverName}</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function prettify(value: string) {
  return value.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function TripStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    pending: "bg-gray-100 text-gray-700",
    waiting_driver_acceptance: "bg-blue-50 text-blue-700",
    driver_assigned: "bg-cyan-50 text-cyan-700",
    en_route_to_pickup: "bg-cyan-50 text-cyan-700",
    at_pickup: "bg-amber-50 text-amber-700",
    loading: "bg-amber-50 text-amber-700",
    in_transit: "bg-indigo-50 text-indigo-700",
    at_delivery: "bg-purple-50 text-purple-700",
    unloading: "bg-purple-50 text-purple-700",
    completed: "bg-emerald-50 text-emerald-700",
    cancelled: "bg-red-50 text-red-700",
    driver_rejected: "bg-red-50 text-red-700",
  };
  return (
    <Badge variant="outline" className={`text-[10px] border-0 ${colorMap[status] ?? "bg-gray-100 text-gray-600"}`}>
      {prettify(status)}
    </Badge>
  );
}

function DataTable<T>({ table }: { table: ReturnType<typeof useReactTable<T>> }) {
  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableRow key={hg.id} className="border-b border-gray-100 bg-gray-50/50">
            {hg.headers.map((h) => (
              <TableHead key={h.id} className="px-4 py-2.5 text-xs font-medium text-gray-500">
                {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id} className="hover:bg-gray-50/50 transition-colors border-gray-50">
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id} className="px-4 py-3 text-sm">
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function QueryState({
  query, icon: Icon, emptyLabel,
}: {
  query: { isLoading: boolean; isError: boolean; error: unknown; data?: { items: unknown[] } };
  icon: React.ComponentType<{ className?: string }>;
  emptyLabel: string;
}) {
  if (query.isLoading) return <Card><CardContent className="p-4 text-sm text-gray-500">Loading...</CardContent></Card>;
  if (query.isError) return <Card><CardContent className="p-4 text-sm text-red-600">{query.error instanceof Error ? query.error.message : "Error"}</CardContent></Card>;
  if (query.data && query.data.items.length === 0) {
    return <Card><CardContent className="p-6 text-center"><Icon className="h-8 w-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{emptyLabel}</p></CardContent></Card>;
  }
  return null;
}
