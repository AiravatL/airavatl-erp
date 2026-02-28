"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Coins } from "lucide-react";
import { CsvExportButton } from "@/components/reports/csv-export-button";
import { ReportPageChrome } from "@/components/reports/report-page-chrome";
import { createDefaultReportFilters } from "@/components/reports/filter-bar";
import { KpiCard } from "@/components/reports/kpi-card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import { getReceivablesAgingReport, type ReportFilters } from "@/lib/api/reports";
import { queryKeys } from "@/lib/query/keys";

const CHART_CONFIG = {
  amount: { label: "Outstanding Amount", color: "#ef4444" },
} satisfies ChartConfig;

export default function ReceivablesAgingReportPage() {
  const [filters, setFilters] = useState<ReportFilters>(createDefaultReportFilters());

  const reportQuery = useQuery({
    queryKey: queryKeys.reportReceivablesAging(filters),
    queryFn: () => getReceivablesAgingReport(filters),
  });

  const report = reportQuery.data;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <ReportPageChrome
        title="Receivables Aging"
        description="Outstanding receivables with aging analysis by customer."
        filters={filters}
        onFiltersChange={setFilters}
        dataQuality={report?.dataQuality}
        actions={
          <CsvExportButton
            fileName="receivables-aging.csv"
            rows={report?.customers ?? []}
            columns={[
              { key: "customerName", header: "Customer", value: (row) => row.customerName },
              { key: "outstandingAmount", header: "Outstanding Amount", value: (row) => row.outstandingAmount },
              { key: "itemsCount", header: "Items Count", value: (row) => row.itemsCount },
            ]}
          />
        }
      />

      {reportQuery.isLoading ? (
        <Card>
          <CardContent className="p-4 text-sm text-gray-500">Loading receivables aging report...</CardContent>
        </Card>
      ) : reportQuery.isError ? (
        <Card>
          <CardContent className="p-4 text-sm text-red-600">
            {reportQuery.error instanceof Error ? reportQuery.error.message : "Unable to load receivables aging report"}
          </CardContent>
        </Card>
      ) : !report ? (
        <EmptyState icon={Coins} title="No data" description="No receivables rows for selected filters." />
      ) : (
        <>
          <Card>
            <CardContent className="p-3 text-xs text-amber-700">
              Receivables lifecycle workflows are still being finalized. Treat this report as directional.
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <KpiCard label="Total Outstanding" value={formatCurrency(report.summary.totalOutstanding)} />
            <KpiCard
              label="Open Items"
              value={report.buckets.reduce((sum, bucket) => sum + bucket.count, 0).toLocaleString("en-IN")}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Aging Buckets</CardTitle>
              <CardDescription className="text-xs">Outstanding amount by aging bucket</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={CHART_CONFIG} className="h-[300px]">
                <BarChart data={report.buckets} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />} />
                  <Bar dataKey="amount" fill="var(--color-amount)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Customer Outstanding</CardTitle>
              <CardDescription className="text-xs">Outstanding breakdown by customer</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Outstanding Amount</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.customers.map((row) => (
                    <TableRow key={row.customerId}>
                      <TableCell className="font-medium">{row.customerName}</TableCell>
                      <TableCell className="text-right text-red-600">{formatCurrency(row.outstandingAmount)}</TableCell>
                      <TableCell className="text-right">{row.itemsCount.toLocaleString("en-IN")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
