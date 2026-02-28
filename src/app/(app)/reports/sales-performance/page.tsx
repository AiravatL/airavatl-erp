"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { CsvExportButton } from "@/components/reports/csv-export-button";
import { ReportPageChrome } from "@/components/reports/report-page-chrome";
import { createDefaultReportFilters } from "@/components/reports/filter-bar";
import { KpiCard } from "@/components/reports/kpi-card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import { getSalesPerformanceReport, type ReportFilters } from "@/lib/api/reports";
import { queryKeys } from "@/lib/query/keys";

const CHART_CONFIG = {
  revenue: { label: "Revenue", color: "#3b82f6" },
  collectedAmount: { label: "Collected", color: "#10b981" },
  outstandingAmount: { label: "Outstanding", color: "#ef4444" },
} satisfies ChartConfig;

export default function SalesPerformanceReportPage() {
  const [filters, setFilters] = useState<ReportFilters>(createDefaultReportFilters());

  const reportQuery = useQuery({
    queryKey: queryKeys.reportSalesPerformance(filters),
    queryFn: () => getSalesPerformanceReport(filters),
  });

  const report = reportQuery.data;

  const topRows = useMemo(
    () =>
      [...(report?.rows ?? [])]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8),
    [report?.rows],
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <ReportPageChrome
        title="Sales Performance"
        description="Trip volume, revenue, and collection metrics by salesperson."
        filters={filters}
        onFiltersChange={setFilters}
        dataQuality={report?.dataQuality}
        actions={
          <CsvExportButton
            fileName="sales-performance.csv"
            rows={report?.rows ?? []}
            columns={[
              { key: "ownerName", header: "Owner", value: (row) => row.ownerName },
              { key: "tripsCount", header: "Trips", value: (row) => row.tripsCount },
              { key: "closedTrips", header: "Closed Trips", value: (row) => row.closedTrips },
              { key: "revenue", header: "Revenue", value: (row) => row.revenue },
              { key: "collectedAmount", header: "Collected", value: (row) => row.collectedAmount },
              { key: "outstandingAmount", header: "Outstanding", value: (row) => row.outstandingAmount },
              { key: "collectionRatioPct", header: "Collection Ratio %", value: (row) => row.collectionRatioPct },
            ]}
          />
        }
      />

      {reportQuery.isLoading ? (
        <Card>
          <CardContent className="p-4 text-sm text-gray-500">Loading sales performance...</CardContent>
        </Card>
      ) : reportQuery.isError ? (
        <Card>
          <CardContent className="p-4 text-sm text-red-600">
            {reportQuery.error instanceof Error ? reportQuery.error.message : "Unable to load sales performance"}
          </CardContent>
        </Card>
      ) : !report ? (
        <EmptyState icon={BarChart3} title="No data" description="No sales performance rows for selected filters." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Revenue" value={formatCurrency(report.summary.totalRevenue)} />
            <KpiCard label="Collected" value={formatCurrency(report.summary.totalCollected)} />
            <KpiCard label="Outstanding" value={formatCurrency(report.summary.totalOutstanding)} />
            <KpiCard label="Collection Ratio" value={`${report.summary.collectionRatioPct.toFixed(2)}%`} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Owner-wise Revenue and Collection</CardTitle>
              <CardDescription className="text-xs">Top contributors by revenue and collections</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={CHART_CONFIG} className="h-[320px]">
                <BarChart data={topRows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="ownerName" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />} />
                  <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="collectedAmount" fill="var(--color-collectedAmount)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outstandingAmount" fill="var(--color-outstandingAmount)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Sales Drilldown</CardTitle>
              <CardDescription className="text-xs">Trips, closures, revenue, collections by owner</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Owner</TableHead>
                    <TableHead className="text-right">Trips</TableHead>
                    <TableHead className="text-right">Closed</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Collection %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={`${row.ownerId ?? "none"}-${row.ownerName}`}>
                      <TableCell className="font-medium">{row.ownerName}</TableCell>
                      <TableCell className="text-right">{row.tripsCount.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right">{row.closedTrips.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                      <TableCell className="text-right text-emerald-700">{formatCurrency(row.collectedAmount)}</TableCell>
                      <TableCell className="text-right text-red-600">{formatCurrency(row.outstandingAmount)}</TableCell>
                      <TableCell className="text-right">{row.collectionRatioPct.toFixed(2)}%</TableCell>
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
