"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Truck } from "lucide-react";
import { CsvExportButton } from "@/components/reports/csv-export-button";
import { ReportPageChrome } from "@/components/reports/report-page-chrome";
import { createDefaultReportFilters } from "@/components/reports/filter-bar";
import { KpiCard } from "@/components/reports/kpi-card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import { getUtilizationReport, type ReportFilters } from "@/lib/api/reports";
import { queryKeys } from "@/lib/query/keys";

const UTILIZATION_CONFIG = {
  utilizationPct: { label: "Utilization %", color: "#3b82f6" },
  tripsCount: { label: "Trips", color: "#10b981" },
} satisfies ChartConfig;

export default function UtilizationReportPage() {
  const [filters, setFilters] = useState<ReportFilters>(createDefaultReportFilters());

  const reportQuery = useQuery({
    queryKey: queryKeys.reportUtilization(filters),
    queryFn: () => getUtilizationReport(filters),
  });

  const report = reportQuery.data;

  const topRows = useMemo(
    () =>
      [...(report?.rows ?? [])]
        .sort((a, b) => b.utilizationPct - a.utilizationPct)
        .slice(0, 10),
    [report?.rows],
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <ReportPageChrome
        title="Utilization Report"
        description="Leased fleet utilization, idle days, and trip frequency."
        filters={filters}
        onFiltersChange={setFilters}
        dataQuality={report?.dataQuality}
        actions={
          <CsvExportButton
            fileName="utilization-report.csv"
            rows={report?.rows ?? []}
            columns={[
              { key: "vehicleNumber", header: "Vehicle Number", value: (row) => row.vehicleNumber },
              { key: "vehicleType", header: "Vehicle Type", value: (row) => row.vehicleType },
              { key: "tripsCount", header: "Trips Count", value: (row) => row.tripsCount },
              { key: "activeDays", header: "Active Days", value: (row) => row.activeDays },
              { key: "idleDays", header: "Idle Days", value: (row) => row.idleDays },
              { key: "utilizationPct", header: "Utilization %", value: (row) => row.utilizationPct },
              { key: "totalRevenue", header: "Total Revenue", value: (row) => row.totalRevenue },
            ]}
          />
        }
      />

      {reportQuery.isLoading ? (
        <Card>
          <CardContent className="p-4 text-sm text-gray-500">Loading utilization report...</CardContent>
        </Card>
      ) : reportQuery.isError ? (
        <Card>
          <CardContent className="p-4 text-sm text-red-600">
            {reportQuery.error instanceof Error ? reportQuery.error.message : "Unable to load utilization report"}
          </CardContent>
        </Card>
      ) : !report ? (
        <EmptyState icon={Truck} title="No data" description="No utilization rows for selected filters." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Window (Days)" value={report.summary.windowDays.toLocaleString("en-IN")} />
            <KpiCard label="Leased Vehicles" value={report.summary.totalLeasedVehicles.toLocaleString("en-IN")} />
            <KpiCard label="Active Vehicles" value={report.summary.activeLeasedVehicles.toLocaleString("en-IN")} />
            <KpiCard label="Utilization" value={`${report.summary.utilizationPct.toFixed(2)}%`} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top Vehicle Utilization</CardTitle>
              <CardDescription className="text-xs">Utilization and trip count by vehicle</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={UTILIZATION_CONFIG} className="h-[320px]">
                <BarChart data={topRows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="vehicleNumber" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => {
                          if (name === "Utilization %") return `${Number(value).toFixed(2)}%`;
                          return Number(value).toLocaleString("en-IN");
                        }}
                      />
                    }
                  />
                  <Bar dataKey="utilizationPct" fill="var(--color-utilizationPct)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="tripsCount" fill="var(--color-tripsCount)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Vehicle Drilldown</CardTitle>
              <CardDescription className="text-xs">Trip frequency and idle-day details per leased vehicle</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Trips</TableHead>
                    <TableHead className="text-right">Active Days</TableHead>
                    <TableHead className="text-right">Idle Days</TableHead>
                    <TableHead className="text-right">Utilization %</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.vehicleId}>
                      <TableCell className="font-medium">{row.vehicleNumber}</TableCell>
                      <TableCell>{row.vehicleType}</TableCell>
                      <TableCell className="text-right">{row.tripsCount.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right">{row.activeDays.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right">{row.idleDays.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right">{row.utilizationPct.toFixed(2)}%</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.totalRevenue)}</TableCell>
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
