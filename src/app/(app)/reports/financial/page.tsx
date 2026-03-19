"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { CreditCard, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/reports/kpi-card";
import { CsvExportButton, type CsvColumn } from "@/components/reports/csv-export-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { formatDate, formatCurrency } from "@/lib/formatters";
import {
  listPayments, listPayouts,
  type PaymentItem, type PayoutItem,
  type PaymentFilters, type PayoutFilters,
} from "@/lib/api/app-reports";
import { queryKeys } from "@/lib/query/keys";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";

/* ---------- Payments columns ---------- */

const payCol = createColumnHelper<PaymentItem>();
const paymentColumns = [
  payCol.accessor("tripNumber", { header: "Trip #", cell: (i) => <span className="font-medium text-gray-900">{i.getValue()}</span> }),
  payCol.accessor("paymentType", { header: "Type", cell: (i) => prettify(i.getValue()) }),
  payCol.accessor("amount", { header: "Amount", cell: (i) => formatCurrency(i.getValue()) }),
  payCol.accessor("method", { header: "Method", cell: (i) => i.getValue() ?? <span className="text-gray-300">—</span> }),
  payCol.accessor("status", { header: "Status", cell: (i) => <PaymentStatusBadge status={i.getValue()} /> }),
  payCol.accessor("razorpayPaymentId", { header: "Razorpay ID", cell: (i) => <span className="text-xs text-gray-500 font-mono">{i.getValue() ?? "—"}</span> }),
  payCol.accessor("consignerName", { header: "Consigner", cell: (i) => i.getValue() ?? "—" }),
  payCol.accessor("createdAt", { header: "Date", cell: (i) => <span className="text-gray-500 text-xs">{formatDate(i.getValue())}</span> }),
];

const paymentCsvCols: CsvColumn<PaymentItem>[] = [
  { key: "tripNumber", header: "Trip #", value: (r) => r.tripNumber },
  { key: "paymentType", header: "Type", value: (r) => r.paymentType },
  { key: "amount", header: "Amount", value: (r) => r.amount },
  { key: "method", header: "Method", value: (r) => r.method },
  { key: "status", header: "Status", value: (r) => r.status },
  { key: "razorpayPaymentId", header: "Razorpay ID", value: (r) => r.razorpayPaymentId },
  { key: "consignerName", header: "Consigner", value: (r) => r.consignerName },
  { key: "driverName", header: "Driver", value: (r) => r.driverName },
  { key: "createdAt", header: "Date", value: (r) => r.createdAt },
];

/* ---------- Payouts columns ---------- */

const poCol = createColumnHelper<PayoutItem>();
const payoutColumns = [
  poCol.accessor("tripNumber", { header: "Trip #", cell: (i) => <span className="font-medium text-gray-900">{i.getValue()}</span> }),
  poCol.accessor("driverName", { header: "Driver" }),
  poCol.accessor("payoutType", { header: "Type", cell: (i) => prettify(i.getValue()) }),
  poCol.accessor("amount", { header: "Amount", cell: (i) => formatCurrency(i.getValue()) }),
  poCol.accessor("status", { header: "Status", cell: (i) => <PayoutStatusBadge status={i.getValue()} /> }),
  poCol.accessor("utr", { header: "UTR", cell: (i) => <span className="text-xs text-gray-500 font-mono">{i.getValue() ?? "—"}</span> }),
  poCol.accessor("razorpayStatus", { header: "RZP Status", cell: (i) => i.getValue() ?? "—" }),
  poCol.accessor("createdAt", { header: "Date", cell: (i) => <span className="text-gray-500 text-xs">{formatDate(i.getValue())}</span> }),
];

const payoutCsvCols: CsvColumn<PayoutItem>[] = [
  { key: "tripNumber", header: "Trip #", value: (r) => r.tripNumber },
  { key: "driverName", header: "Driver", value: (r) => r.driverName },
  { key: "payoutType", header: "Type", value: (r) => r.payoutType },
  { key: "amount", header: "Amount", value: (r) => r.amount },
  { key: "status", header: "Status", value: (r) => r.status },
  { key: "utr", header: "UTR", value: (r) => r.utr },
  { key: "razorpayStatus", header: "RZP Status", value: (r) => r.razorpayStatus },
  { key: "createdAt", header: "Date", value: (r) => r.createdAt },
];

export default function FinancialReportPage() {
  const [tab, setTab] = useState<"payments" | "payouts">("payments");
  const [payFilters, setPayFilters] = useState<PaymentFilters>({ limit: 100 });
  const [poFilters, setPoFilters] = useState<PayoutFilters>({ limit: 100 });

  const paymentsQuery = useQuery({
    queryKey: queryKeys.appPayments(payFilters),
    queryFn: () => listPayments(payFilters),
  });
  const payoutsQuery = useQuery({
    queryKey: queryKeys.appPayouts(poFilters),
    queryFn: () => listPayouts(poFilters),
  });

  const payments = paymentsQuery.data?.items ?? [];
  const payouts = payoutsQuery.data?.items ?? [];

  const paymentTable = useReactTable({ data: payments, columns: paymentColumns, getCoreRowModel: getCoreRowModel() });
  const payoutTable = useReactTable({ data: payouts, columns: payoutColumns, getCoreRowModel: getCoreRowModel() });

  const payTotal = paymentsQuery.data?.total ?? 0;
  const payVolume = payments.reduce((s, p) => s + p.amount, 0);
  const payCompleted = payments.filter((p) => p.status === "completed").length;

  const poTotal = payoutsQuery.data?.total ?? 0;
  const poVolume = payouts.reduce((s, p) => s + p.amount, 0);
  const poProcessed = payouts.filter((p) => p.status === "processed").length;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader title="Financial Analytics" description="Payments and driver payouts" />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "payments" | "payouts")}>
        <TabsList className="bg-gray-100 h-8">
          <TabsTrigger value="payments" className="text-xs h-7 data-[state=active]:bg-white">Payments</TabsTrigger>
          <TabsTrigger value="payouts" className="text-xs h-7 data-[state=active]:bg-white">Payouts</TabsTrigger>
        </TabsList>

        {/* Payments Tab */}
        <TabsContent value="payments" className="mt-4 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  placeholder="Search..."
                  value={payFilters.search ?? ""}
                  onChange={(e) => setPayFilters((f) => ({ ...f, search: e.target.value || undefined, offset: 0 }))}
                  className="h-8 pl-8 text-sm"
                  maxLength={FIELD_LIMITS.search}
                />
              </div>
              <Select value={payFilters.status ?? "all"} onValueChange={(v) => setPayFilters((f) => ({ ...f, status: v === "all" ? undefined : v, offset: 0 }))}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectContent>
              </Select>
              <Select value={payFilters.paymentType ?? "all"} onValueChange={(v) => setPayFilters((f) => ({ ...f, paymentType: v === "all" ? undefined : v, offset: 0 }))}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="advance">Advance</SelectItem>
                  <SelectItem value="balance">Balance</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CsvExportButton fileName="payments-report.csv" rows={payments} columns={paymentCsvCols} />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Total Payments" value={payTotal.toLocaleString("en-IN")} />
            <KpiCard label="Volume" value={formatCurrency(payVolume)} />
            <KpiCard label="Completed" value={payCompleted.toLocaleString("en-IN")} />
            <KpiCard label="Failed" value={payments.filter((p) => p.status === "failed").length.toLocaleString("en-IN")} />
          </div>

          <QueryState query={paymentsQuery} icon={CreditCard} emptyLabel="No payments found." />
          {payments.length > 0 && (
            <Card><CardContent className="p-0"><DataTable table={paymentTable} /></CardContent></Card>
          )}
        </TabsContent>

        {/* Payouts Tab */}
        <TabsContent value="payouts" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <Select value={poFilters.status ?? "all"} onValueChange={(v) => setPoFilters((f) => ({ ...f, status: v === "all" ? undefined : v, offset: 0 }))}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="processed">Processed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <CsvExportButton fileName="payouts-report.csv" rows={payouts} columns={payoutCsvCols} />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Total Payouts" value={poTotal.toLocaleString("en-IN")} />
            <KpiCard label="Volume" value={formatCurrency(poVolume)} />
            <KpiCard label="Processed" value={poProcessed.toLocaleString("en-IN")} />
            <KpiCard label="Pending" value={payouts.filter((p) => p.status === "pending").length.toLocaleString("en-IN")} />
          </div>

          <QueryState query={payoutsQuery} icon={CreditCard} emptyLabel="No payouts found." />
          {payouts.length > 0 && (
            <Card><CardContent className="p-0"><DataTable table={payoutTable} /></CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------- Shared ---------- */

function prettify(value: string) {
  return value.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function PaymentStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700",
    completed: "bg-emerald-50 text-emerald-700",
    failed: "bg-red-50 text-red-700",
    refunded: "bg-purple-50 text-purple-700",
  };
  return <Badge variant="outline" className={`text-[10px] border-0 ${colorMap[status] ?? "bg-gray-100 text-gray-600"}`}>{prettify(status)}</Badge>;
}

function PayoutStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700",
    processing: "bg-blue-50 text-blue-700",
    processed: "bg-emerald-50 text-emerald-700",
    failed: "bg-red-50 text-red-700",
  };
  return <Badge variant="outline" className={`text-[10px] border-0 ${colorMap[status] ?? "bg-gray-100 text-gray-600"}`}>{prettify(status)}</Badge>;
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
