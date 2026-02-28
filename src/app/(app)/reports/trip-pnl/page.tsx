"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { CsvExportButton } from "@/components/reports/csv-export-button";
import { ReportPageChrome } from "@/components/reports/report-page-chrome";
import { createDefaultReportFilters } from "@/components/reports/filter-bar";
import { KpiCard } from "@/components/reports/kpi-card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import { getTripPnlReport, type ReportFilters } from "@/lib/api/reports";
import { queryKeys } from "@/lib/query/keys";
import { TrendingUp } from "lucide-react";

const CHART_CONFIG = {
  tripAmount: { label: "Trip Amount", color: "#3b82f6" },
  actualCost: { label: "Actual Cost", color: "#f97316" },
  margin: { label: "Margin", color: "#10b981" },
} satisfies ChartConfig;

export default function TripPnlReportPage() {
  const [filters, setFilters] = useState<ReportFilters>(createDefaultReportFilters());

  const tripPnlQuery = useQuery({
    queryKey: queryKeys.reportTripPnl(filters),
    queryFn: () => getTripPnlReport(filters),
  });

  const report = tripPnlQuery.data;

  const topRowsForChart = useMemo(
    () =>
      [...(report?.rows ?? [])]
        .sort((a, b) => b.tripAmount - a.tripAmount)
        .slice(0, 8)
        .map((row) => ({
          tripCode: row.tripCode,
          tripAmount: row.tripAmount,
          actualCost: row.actualCost,
          margin: row.margin,
        })),
    [report?.rows],
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <ReportPageChrome
        title="Trip P&L Report"
        description="Leased trip profitability analysis with expected vs actual costs."
        filters={filters}
        onFiltersChange={setFilters}
        dataQuality={report?.dataQuality}
        actions={
          <CsvExportButton
            fileName="trip-pnl-report.csv"
            rows={report?.rows ?? []}
            columns={[
              { key: "tripCode", header: "Trip Code", value: (row) => row.tripCode },
              { key: "customerName", header: "Customer", value: (row) => row.customerName },
              { key: "route", header: "Route", value: (row) => row.route },
              { key: "vehicleNumber", header: "Vehicle", value: (row) => row.vehicleNumber },
              { key: "tripAmount", header: "Trip Amount", value: (row) => row.tripAmount },
              { key: "expectedCost", header: "Expected Cost", value: (row) => row.expectedCost },
              { key: "actualCost", header: "Actual Cost", value: (row) => row.actualCost },
              { key: "margin", header: "Margin", value: (row) => row.margin },
              { key: "variance", header: "Variance", value: (row) => row.variance },
            ]}
          />
        }
      />

      {tripPnlQuery.isLoading ? (
        <Card>
          <CardContent className="p-4 text-sm text-gray-500">Loading trip P&L report...</CardContent>
        </Card>
      ) : tripPnlQuery.isError ? (
        <Card>
          <CardContent className="p-4 text-sm text-red-600">
            {tripPnlQuery.error instanceof Error ? tripPnlQuery.error.message : "Unable to load trip P&L report"}
          </CardContent>
        </Card>
      ) : !report ? (
        <EmptyState icon={TrendingUp} title="No data" description="No P&L records for selected filters." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <KpiCard label="Leased Trips" value={report.summary.tripCount.toLocaleString("en-IN")} />
            <KpiCard label="Revenue" value={formatCurrency(report.summary.revenue)} />
            <KpiCard label="Expected Cost" value={formatCurrency(report.summary.expectedCost)} />
            <KpiCard label="Actual Cost" value={formatCurrency(report.summary.actualCost)} />
            <KpiCard label="Margin" value={formatCurrency(report.summary.margin)} />
            <KpiCard label="Margin %" value={`${report.summary.marginPct.toFixed(2)}%`} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top Trips by Revenue</CardTitle>
              <CardDescription className="text-xs">Comparing trip amount, actual cost and margin</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={CHART_CONFIG} className="h-[320px]">
                <BarChart data={topRowsForChart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="tripCode" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => formatCurrency(Number(value))}
                      />
                    }
                  />
                  <Bar dataKey="tripAmount" fill="var(--color-tripAmount)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actualCost" fill="var(--color-actualCost)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="margin" fill="var(--color-margin)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Trip-level P&L</CardTitle>
              <CardDescription className="text-xs">Full drilldown of expected vs actual cost and margin</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trip</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead className="text-right">Trip Amount</TableHead>
                    <TableHead className="text-right">Expected Cost</TableHead>
                    <TableHead className="text-right">Actual Cost</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.tripId}>
                      <TableCell className="font-medium">{row.tripCode}</TableCell>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell>{row.route || "-"}</TableCell>
                      <TableCell>{row.vehicleNumber || "-"}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.tripAmount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.expectedCost)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.actualCost)}</TableCell>
                      <TableCell className={row.variance > 0 ? "text-red-600 text-right" : "text-emerald-700 text-right"}>
                        {formatCurrency(row.variance)}
                      </TableCell>
                      <TableCell className={row.margin < 0 ? "text-red-600 text-right" : "text-emerald-700 text-right"}>
                        {formatCurrency(row.margin)}
                      </TableCell>
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
