"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Receipt } from "lucide-react";
import { CsvExportButton } from "@/components/reports/csv-export-button";
import { ReportPageChrome } from "@/components/reports/report-page-chrome";
import { createDefaultReportFilters } from "@/components/reports/filter-bar";
import { KpiCard } from "@/components/reports/kpi-card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatters";
import { getExpenseSummaryReport, type ReportFilters } from "@/lib/api/reports";
import { queryKeys } from "@/lib/query/keys";

const CATEGORY_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

const MONTHLY_CONFIG = {
  total: { label: "Total", color: "#3b82f6" },
  overCapTotal: { label: "Over Cap", color: "#ef4444" },
} satisfies ChartConfig;

function prettify(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function ExpenseSummaryReportPage() {
  const [filters, setFilters] = useState<ReportFilters>(createDefaultReportFilters());

  const reportQuery = useQuery({
    queryKey: queryKeys.reportExpenseSummary(filters),
    queryFn: () => getExpenseSummaryReport(filters),
  });

  const report = reportQuery.data;

  const categoryChartData = useMemo(
    () =>
      (report?.categoryBreakdown ?? []).map((row, index) => ({
        ...row,
        label: prettify(row.category),
        fill: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      })),
    [report?.categoryBreakdown],
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <ReportPageChrome
        title="Expense Summary"
        description="Category-wise expense breakdown with cap analysis."
        filters={filters}
        onFiltersChange={setFilters}
        dataQuality={report?.dataQuality}
        actions={
          <CsvExportButton
            fileName="expense-summary.csv"
            rows={report?.categoryBreakdown ?? []}
            columns={[
              { key: "category", header: "Category", value: (row) => row.category },
              { key: "amount", header: "Amount", value: (row) => row.amount },
              { key: "count", header: "Count", value: (row) => row.count },
              { key: "overCapAmount", header: "Over Cap Amount", value: (row) => row.overCapAmount },
            ]}
          />
        }
      />

      {reportQuery.isLoading ? (
        <Card>
          <CardContent className="p-4 text-sm text-gray-500">Loading expense summary...</CardContent>
        </Card>
      ) : reportQuery.isError ? (
        <Card>
          <CardContent className="p-4 text-sm text-red-600">
            {reportQuery.error instanceof Error ? reportQuery.error.message : "Unable to load expense summary"}
          </CardContent>
        </Card>
      ) : !report ? (
        <EmptyState icon={Receipt} title="No data" description="No expense records for selected filters." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard label="Total Expenses" value={formatCurrency(report.summary.totalExpenses)} />
            <KpiCard label="Over Cap Expenses" value={formatCurrency(report.summary.overCapExpenses)} />
            <KpiCard label="Over Cap Entries" value={report.summary.overCapCount.toLocaleString("en-IN")} />
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Category Share</CardTitle>
                <CardDescription className="text-xs">Expense contribution by category</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={{ amount: { label: "Amount", color: "#111827" } }} className="h-[280px]">
                  <PieChart>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, _name, item) => {
                            const category = prettify(String(item.payload?.category ?? ""));
                            return `${category}: ${formatCurrency(Number(value))}`;
                          }}
                        />
                      }
                    />
                    <Pie data={categoryChartData} dataKey="amount" nameKey="label" innerRadius={60} outerRadius={92}>
                      {categoryChartData.map((entry, index) => (
                        <Cell key={`${entry.category}-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="mt-2 space-y-1.5 text-xs text-gray-600">
                  {categoryChartData.map((entry) => (
                    <div key={entry.category} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.fill }} />
                        {entry.label}
                      </div>
                      <span className="font-medium text-gray-800">{formatCurrency(entry.amount)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Monthly Trend</CardTitle>
                <CardDescription className="text-xs">Total expenses vs over-cap totals</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={MONTHLY_CONFIG} className="h-[280px]">
                  <BarChart data={report.monthlyTrend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} />
                    <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />} />
                    <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="overCapTotal" fill="var(--color-overCapTotal)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Category Drilldown</CardTitle>
              <CardDescription className="text-xs">Cap analysis details by expense category</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Over Cap Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.categoryBreakdown.map((row) => (
                    <TableRow key={row.category}>
                      <TableCell className="font-medium">{prettify(row.category)}</TableCell>
                      <TableCell className="text-right">{row.count.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.amount)}</TableCell>
                      <TableCell className="text-right text-red-600">{formatCurrency(row.overCapAmount)}</TableCell>
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
