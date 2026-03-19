"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { Bar, BarChart, Cell, Pie, PieChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { PackagePlus, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/reports/kpi-card";
import { CsvExportButton, type CsvColumn } from "@/components/reports/csv-export-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { formatDate, formatCurrency } from "@/lib/formatters";
import { listAuctions, type AuctionItem, type AuctionFilters } from "@/lib/api/app-reports";
import { queryKeys } from "@/lib/query/keys";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";

const col = createColumnHelper<AuctionItem>();

const columns = [
  col.accessor("requestNumber", {
    header: "Request #",
    cell: (info) => <span className="font-medium text-gray-900">{info.getValue()}</span>,
  }),
  col.accessor("consignerName", { header: "Consigner" }),
  col.display({
    id: "route",
    header: "Route",
    cell: (info) => (
      <span className="text-gray-600">
        {info.row.original.pickupCity} → {info.row.original.deliveryCity}
      </span>
    ),
  }),
  col.accessor("vehicleType", { header: "Vehicle Type" }),
  col.accessor("status", {
    header: "Status",
    cell: (info) => <StatusBadge status={info.getValue()} />,
  }),
  col.accessor("totalBidsCount", { header: "Bids" }),
  col.accessor("lowestBidAmount", {
    header: "Lowest Bid",
    cell: (info) => {
      const v = info.getValue();
      return v !== null ? formatCurrency(v) : <span className="text-gray-300">—</span>;
    },
  }),
  col.accessor("createdAt", {
    header: "Created",
    cell: (info) => <span className="text-gray-500 text-xs">{formatDate(info.getValue())}</span>,
  }),
];

const csvColumns: CsvColumn<AuctionItem>[] = [
  { key: "requestNumber", header: "Request #", value: (r) => r.requestNumber },
  { key: "consignerName", header: "Consigner", value: (r) => r.consignerName },
  { key: "pickupCity", header: "Pickup", value: (r) => r.pickupCity },
  { key: "deliveryCity", header: "Delivery", value: (r) => r.deliveryCity },
  { key: "vehicleType", header: "Vehicle Type", value: (r) => r.vehicleType },
  { key: "status", header: "Status", value: (r) => r.status },
  { key: "totalBidsCount", header: "Bids", value: (r) => r.totalBidsCount },
  { key: "lowestBidAmount", header: "Lowest Bid", value: (r) => r.lowestBidAmount },
  { key: "createdAt", header: "Created", value: (r) => r.createdAt },
];

export default function AuctionsReportPage() {
  const [filters, setFilters] = useState<AuctionFilters>({ limit: 100 });

  const query = useQuery({
    queryKey: queryKeys.appAuctions(filters),
    queryFn: () => listAuctions(filters),
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalBids = items.reduce((sum, a) => sum + a.totalBidsCount, 0);
  const awarded = items.filter((a) => a.status === "awarded").length;

  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() });

  const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];
  const statusChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of items) { map.set(a.status, (map.get(a.status) ?? 0) + 1); }
    return Array.from(map.entries()).map(([status, count], i) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: count,
      fill: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [items]);

  const vehicleChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of items) { map.set(a.vehicleType || "Unknown", (map.get(a.vehicleType || "Unknown") ?? 0) + 1); }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));
  }, [items]);

  const chartConfig = { value: { label: "Count", color: "#6366f1" } } satisfies ChartConfig;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Auction Analytics" description="Delivery request and bidding data">
        <CsvExportButton fileName="auctions-report.csv" rows={items} columns={csvColumns} />
      </PageHeader>

      {/* Filters */}
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
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="bidding">Bidding</SelectItem>
            <SelectItem value="awarded">Awarded</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.requestType ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, requestType: v === "all" ? undefined : v, offset: 0 }))}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="auction">Auction</SelectItem>
            <SelectItem value="instant">Instant</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Auctions" value={total.toLocaleString("en-IN")} />
        <KpiCard label="Total Bids" value={totalBids.toLocaleString("en-IN")} />
        <KpiCard label="Avg Bids/Auction" value={total > 0 ? (totalBids / total).toFixed(1) : "0"} />
        <KpiCard label="Awarded" value={awarded.toLocaleString("en-IN")} />
      </div>

      {/* Charts */}
      {items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-gray-900 mb-3">Status Distribution</p>
              <ChartContainer config={chartConfig} className="h-[200px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie data={statusChart} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {statusChart.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 justify-center">
                {statusChart.map((s) => (
                  <span key={s.name} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.fill }} />
                    {s.name} ({s.value})
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-gray-900 mb-3">By Vehicle Type</p>
              <ChartContainer config={chartConfig} className="h-[200px]">
                <BarChart data={vehicleChart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Content */}
      <QueryState query={query} icon={PackagePlus} emptyLabel="No auctions found." />
      {items.length > 0 && (
        <>
          <div className="hidden sm:block">
            <Card><CardContent className="p-0"><DataTable table={table} /></CardContent></Card>
          </div>
          <div className="sm:hidden space-y-2">
            {items.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{a.requestNumber}</p>
                      <p className="text-xs text-gray-500">{a.consignerName}</p>
                      <p className="text-[11px] text-gray-400">{a.pickupCity} → {a.deliveryCity}</p>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-gray-500">
                    <span>{a.vehicleType}</span>
                    <span>{a.totalBidsCount} bids</span>
                    {a.lowestBidAmount !== null && <span>{formatCurrency(a.lowestBidAmount)}</span>}
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

/* ---------- Shared ---------- */

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    open: "bg-blue-50 text-blue-700",
    bidding: "bg-amber-50 text-amber-700",
    awarded: "bg-emerald-50 text-emerald-700",
    expired: "bg-gray-100 text-gray-600",
    cancelled: "bg-red-50 text-red-700",
  };
  return (
    <Badge variant="outline" className={`text-[10px] border-0 ${colorMap[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
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
  query,
  icon: Icon,
  emptyLabel,
}: {
  query: { isLoading: boolean; isError: boolean; error: unknown; data?: { items: unknown[] } };
  icon: React.ComponentType<{ className?: string }>;
  emptyLabel: string;
}) {
  if (query.isLoading) return <Card><CardContent className="p-4 text-sm text-gray-500">Loading...</CardContent></Card>;
  if (query.isError) return <Card><CardContent className="p-4 text-sm text-red-600">{query.error instanceof Error ? query.error.message : "Error"}</CardContent></Card>;
  if (query.data && query.data.items.length === 0) {
    return (
      <Card><CardContent className="p-6 text-center">
        <Icon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">{emptyLabel}</p>
      </CardContent></Card>
    );
  }
  return null;
}
