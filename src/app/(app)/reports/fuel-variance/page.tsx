"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Fuel } from "lucide-react";
import { CsvExportButton } from "@/components/reports/csv-export-button";
import { ReportPageChrome } from "@/components/reports/report-page-chrome";
import { createDefaultReportFilters } from "@/components/reports/filter-bar";
import { KpiCard } from "@/components/reports/kpi-card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import { getFuelVarianceReport, type ReportFilters } from "@/lib/api/reports";
import { queryKeys } from "@/lib/query/keys";

const CHART_CONFIG = {
  fuelAmount: { label: "Fuel Amount", color: "#3b82f6" },
  actualKm: { label: "Actual KM", color: "#10b981" },
} satisfies ChartConfig;

export default function FuelVarianceReportPage() {
  const [filters, setFilters] = useState<ReportFilters>(createDefaultReportFilters());

  const reportQuery = useQuery({
    queryKey: queryKeys.reportFuelVariance(filters),
    queryFn: () => getFuelVarianceReport(filters),
  });

  const report = reportQuery.data;

  const rowsForChart = useMemo(
    () =>
      [...(report?.rows ?? [])]
        .filter((row) => row.fuelAmount > 0)
        .slice(0, 10)
        .map((row) => ({
          tripCode: row.tripCode,
          fuelAmount: row.fuelAmount,
          actualKm: row.actualKm ?? 0,
        })),
    [report?.rows],
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <ReportPageChrome
        title="Fuel Variance Report"
        description="Actual fuel and distance metrics while expected model is being finalized."
        filters={filters}
        onFiltersChange={setFilters}
        dataQuality={report?.dataQuality}
        actions={
          <CsvExportButton
            fileName="fuel-variance-actuals.csv"
            rows={report?.rows ?? []}
            columns={[
              { key: "tripCode", header: "Trip Code", value: (row) => row.tripCode },
              { key: "route", header: "Route", value: (row) => row.route },
              { key: "vehicleNumber", header: "Vehicle", value: (row) => row.vehicleNumber },
              { key: "actualKm", header: "Actual KM", value: (row) => row.actualKm },
              { key: "fuelLiters", header: "Fuel Liters", value: (row) => row.fuelLiters },
              { key: "fuelAmount", header: "Fuel Amount", value: (row) => row.fuelAmount },
              { key: "fuelAmountPerKm", header: "Fuel Amount/KM", value: (row) => row.fuelAmountPerKm },
              { key: "expectedFuelAmountPerKm", header: "Expected Fuel/KM", value: (row) => row.expectedFuelAmountPerKm },
              { key: "variancePct", header: "Variance %", value: (row) => row.variancePct },
            ]}
          />
        }
      />

      {reportQuery.isLoading ? (
        <Card>
          <CardContent className="p-4 text-sm text-gray-500">Loading fuel variance report...</CardContent>
        </Card>
      ) : reportQuery.isError ? (
        <Card>
          <CardContent className="p-4 text-sm text-red-600">
            {reportQuery.error instanceof Error ? reportQuery.error.message : "Unable to load fuel variance report"}
          </CardContent>
        </Card>
      ) : !report ? (
        <EmptyState icon={Fuel} title="No data" description="No fuel checkpoint records for selected filters." />
      ) : (
        <>
          <Card>
            <CardContent className="p-3 text-xs text-amber-700">
              Expected fuel model is not finalized yet. This report currently shows actual capture only.
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard label="Trips with Fuel Data" value={report.rows.length.toLocaleString("en-IN")} />
            <KpiCard
              label="Total Fuel Amount"
              value={formatCurrency(report.rows.reduce((sum, row) => sum + row.fuelAmount, 0))}
            />
            <KpiCard
              label="Total Fuel Liters"
              value={report.rows.reduce((sum, row) => sum + row.fuelLiters, 0).toFixed(2)}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Fuel Amount vs Distance</CardTitle>
              <CardDescription className="text-xs">Actual metrics by trip</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={CHART_CONFIG} className="h-[320px]">
                <BarChart data={rowsForChart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="tripCode" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => {
                          if (name === "Fuel Amount") return formatCurrency(Number(value));
                          return Number(value).toLocaleString("en-IN");
                        }}
                      />
                    }
                  />
                  <Bar dataKey="fuelAmount" fill="var(--color-fuelAmount)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actualKm" fill="var(--color-actualKm)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Trip Fuel Detail</CardTitle>
              <CardDescription className="text-xs">Actual-only fuel checkpoints and spend</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trip</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead className="text-right">Actual KM</TableHead>
                    <TableHead className="text-right">Fuel Liters</TableHead>
                    <TableHead className="text-right">Fuel Amount</TableHead>
                    <TableHead className="text-right">Fuel/KM</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Variance %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.tripId}>
                      <TableCell className="font-medium">{row.tripCode}</TableCell>
                      <TableCell>{row.route || "-"}</TableCell>
                      <TableCell>{row.vehicleNumber || "-"}</TableCell>
                      <TableCell className="text-right">{row.actualKm?.toLocaleString("en-IN") ?? "-"}</TableCell>
                      <TableCell className="text-right">{row.fuelLiters.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.fuelAmount)}</TableCell>
                      <TableCell className="text-right">{row.fuelAmountPerKm ? formatCurrency(row.fuelAmountPerKm) : "-"}</TableCell>
                      <TableCell className="text-right">{row.expectedFuelAmountPerKm ? formatCurrency(row.expectedFuelAmountPerKm) : "-"}</TableCell>
                      <TableCell className="text-right">{row.variancePct !== null ? `${row.variancePct.toFixed(2)}%` : "-"}</TableCell>
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
