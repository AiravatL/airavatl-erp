"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { Users, Search } from "lucide-react";
import { Cell, Pie, PieChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/reports/kpi-card";
import { CsvExportButton, type CsvColumn } from "@/components/reports/csv-export-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import { listCustomers, type CustomerItem, type CustomerFilters } from "@/lib/api/app-reports";
import { queryKeys } from "@/lib/query/keys";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";

const col = createColumnHelper<CustomerItem>();

const columns = [
  col.accessor("registeredName", {
    header: "Business Name",
    cell: (info) => (
      <div>
        <span className="font-medium text-gray-900">{info.getValue()}</span>
        {info.row.original.businessName && info.row.original.businessName !== info.getValue() && (
          <span className="block text-[11px] text-gray-400">{info.row.original.businessName}</span>
        )}
      </div>
    ),
  }),
  col.accessor("fullName", { header: "Contact" }),
  col.accessor("phone", { header: "Phone" }),
  col.accessor("salesOwnerName", {
    header: "Sales Owner",
    cell: (info) => info.getValue() ?? <span className="text-gray-300">—</span>,
  }),
  col.accessor("activeTripsCount", { header: "Active Trips" }),
  col.accessor("totalTripsCount", { header: "Total Trips" }),
  col.accessor("totalTripValue", {
    header: "Trip Value",
    cell: (info) => formatCurrency(info.getValue()),
  }),
  col.accessor("outstandingAmount", {
    header: "Outstanding",
    cell: (info) => {
      const v = info.getValue();
      return <span className={v > 0 ? "text-red-600 font-medium" : ""}>{formatCurrency(v)}</span>;
    },
  }),
  col.accessor("creditHealth", {
    header: "Credit Health",
    cell: (info) => <CreditHealthBadge health={info.getValue()} />,
  }),
  col.accessor("creditLimit", {
    header: "Credit Limit",
    cell: (info) => formatCurrency(info.getValue()),
  }),
];

const csvColumns: CsvColumn<CustomerItem>[] = [
  { key: "registeredName", header: "Business Name", value: (r) => r.registeredName },
  { key: "fullName", header: "Contact", value: (r) => r.fullName },
  { key: "phone", header: "Phone", value: (r) => r.phone },
  { key: "email", header: "Email", value: (r) => r.email },
  { key: "salesOwnerName", header: "Sales Owner", value: (r) => r.salesOwnerName },
  { key: "activeTripsCount", header: "Active Trips", value: (r) => r.activeTripsCount },
  { key: "totalTripsCount", header: "Total Trips", value: (r) => r.totalTripsCount },
  { key: "totalTripValue", header: "Trip Value", value: (r) => r.totalTripValue },
  { key: "outstandingAmount", header: "Outstanding", value: (r) => r.outstandingAmount },
  { key: "creditHealth", header: "Credit Health", value: (r) => r.creditHealth },
  { key: "creditLimit", header: "Credit Limit", value: (r) => r.creditLimit },
];

export default function CustomersReportPage() {
  const [filters, setFilters] = useState<CustomerFilters>({ limit: 100 });

  const query = useQuery({
    queryKey: queryKeys.appCustomers(filters),
    queryFn: () => listCustomers(filters),
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const activeTrips = items.reduce((s, c) => s + c.activeTripsCount, 0);
  const totalValue = items.reduce((s, c) => s + c.totalTripValue, 0);
  const totalOutstanding = items.reduce((s, c) => s + c.outstandingAmount, 0);

  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() });

  const creditHealthChart = useMemo(() => {
    const within = items.filter((c) => c.creditHealth === "within_limit").length;
    const over = items.filter((c) => c.creditHealth === "over_limit").length;
    return [
      { name: "Within Limit", value: within, fill: "#10b981" },
      { name: "Over Limit", value: over, fill: "#ef4444" },
    ].filter((d) => d.value > 0);
  }, [items]);

  const topCustomers = useMemo(() => {
    return [...items]
      .sort((a, b) => b.totalTripValue - a.totalTripValue)
      .slice(0, 5)
      .map((c) => ({ name: c.registeredName.slice(0, 20), value: c.totalTripValue }));
  }, [items]);

  const chartConfig = { value: { label: "Value", color: "#6366f1" } } satisfies ChartConfig;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Customer Analytics" description="Consigner analytics and credit health">
        <CsvExportButton fileName="customers-report.csv" rows={items} columns={csvColumns} />
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
        <Select value={filters.creditHealth ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, creditHealth: v === "all" ? undefined : v, offset: 0 }))}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Credit Health</SelectItem>
            <SelectItem value="within_limit">Within Limit</SelectItem>
            <SelectItem value="over_limit">Over Limit</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total Customers" value={total.toLocaleString("en-IN")} />
        <KpiCard label="Active Trips" value={activeTrips.toLocaleString("en-IN")} />
        <KpiCard label="Total Trip Value" value={formatCurrency(totalValue)} />
        <KpiCard label="Outstanding" value={formatCurrency(totalOutstanding)} />
      </div>

      {/* Charts */}
      {items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {creditHealthChart.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-gray-900 mb-3">Credit Health</p>
                <div className="flex items-center gap-6">
                  <ChartContainer config={chartConfig} className="h-[160px] w-[160px] shrink-0">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Pie data={creditHealthChart} dataKey="value" nameKey="name" innerRadius={40} outerRadius={65} paddingAngle={3}>
                        {creditHealthChart.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="space-y-2">
                    {creditHealthChart.map((s) => (
                      <span key={s.name} className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: s.fill }} />
                        {s.name}: <span className="font-semibold">{s.value}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {topCustomers.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-gray-900 mb-3">Top Customers by Trip Value</p>
                <ChartContainer config={chartConfig} className="h-[180px]">
                  <BarChart data={topCustomers} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis type="number" tickLine={false} axisLine={false} fontSize={10} />
                    <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} fontSize={10} width={80} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <QueryState query={query} icon={Users} emptyLabel="No customers found." />
      {items.length > 0 && (
        <>
          <div className="hidden sm:block">
            <Card><CardContent className="p-0"><DataTable table={table} /></CardContent></Card>
          </div>
          <div className="sm:hidden space-y-2">
            {items.map((c) => (
              <Card key={c.consignerId}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{c.registeredName}</p>
                      <p className="text-xs text-gray-500">{c.fullName} &middot; {c.phone}</p>
                    </div>
                    <CreditHealthBadge health={c.creditHealth} />
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-gray-500">
                    <span>{c.totalTripsCount} trips</span>
                    <span>{formatCurrency(c.totalTripValue)}</span>
                    {c.outstandingAmount > 0 && (
                      <span className="text-red-600">{formatCurrency(c.outstandingAmount)} outstanding</span>
                    )}
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

function CreditHealthBadge({ health }: { health: string }) {
  const isOver = health === "over_limit";
  return (
    <Badge
      variant="outline"
      className={`text-[10px] border-0 ${isOver ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
    >
      {isOver ? "Over Limit" : "Within Limit"}
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
