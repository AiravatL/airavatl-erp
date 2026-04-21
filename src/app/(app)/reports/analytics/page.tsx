"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import {
  DateRangeFilterBar,
  createDefaultDateRange,
  type DateRangeFilters,
} from "@/components/reports/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/reports/kpi-card";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { BarChart3, PackagePlus, Truck } from "lucide-react";
import { getAnalytics } from "@/lib/api/analytics";
import { queryKeys } from "@/lib/query/keys";

// Charts pull in recharts (~100 KB gz). Defer the whole block with a
// dynamic import so KPIs render without waiting for that bundle.
const AnalyticsCharts = dynamic(() => import("./_components/analytics-charts"), {
  ssr: false,
  loading: () => (
    <Card>
      <CardContent className="p-4 text-xs text-gray-500">Loading charts…</CardContent>
    </Card>
  ),
});

export default function AnalyticsReportPage() {
  const [filters, setFilters] = useState<DateRangeFilters>(createDefaultDateRange);

  const query = useQuery({
    queryKey: queryKeys.reportsAnalytics(filters),
    queryFn: () => getAnalytics(filters),
    staleTime: 60_000,
  });

  const data = query.data;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Analytics"
        description="Auction + trip funnel, conversion, and trends"
      />
      <DateRangeFilterBar filters={filters} onChange={setFilters} />

      {query.isLoading ? (
        <Card>
          <CardContent className="p-4 text-sm text-gray-500">Loading analytics…</CardContent>
        </Card>
      ) : query.isError ? (
        <Card>
          <CardContent className="p-4 text-sm text-red-600">
            {query.error instanceof Error ? query.error.message : "Unable to load analytics"}
          </CardContent>
        </Card>
      ) : !data ? (
        <EmptyState icon={BarChart3} title="No data" description="No data available for the selected period." />
      ) : (
        <>
          {/* Auction KPIs */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <PackagePlus className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-gray-800">Auctions</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard
                label="Total Auctions"
                value={data.auctions.total.toLocaleString("en-IN")}
                helper={`${data.auctions.erp} ERP · ${data.auctions.app} App`}
              />
              <KpiCard
                label="Converted to Trip"
                value={data.auctions.converted_to_trip.toLocaleString("en-IN")}
                helper={`${data.auctions.conversion_pct}% of total`}
              />
              <KpiCard
                label="Cancelled"
                value={data.auctions.cancelled.toLocaleString("en-IN")}
                helper={`${data.auctions.cancellation_pct}% of total`}
              />
              <KpiCard
                label="Avg Bids / Auction"
                value={data.auctions.avg_bids_per_auction.toString()}
                helper={`${data.auctions.auctions_with_bids} auctions had bids`}
              />
            </div>
          </section>

          {/* Trip KPIs */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-gray-800">Trips</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard
                label="Total Trips"
                value={data.trips.total.toLocaleString("en-IN")}
                helper={`${data.trips.erp} ERP · ${data.trips.app} App`}
              />
              <KpiCard
                label="Completed"
                value={data.trips.completed.toLocaleString("en-IN")}
                helper={`${data.trips.completion_pct}% of total`}
              />
              <KpiCard
                label="Cancelled"
                value={data.trips.cancelled.toLocaleString("en-IN")}
                helper={`${data.trips.cancellation_pct}% of total`}
              />
              <KpiCard
                label="In Progress"
                value={data.trips.in_progress.toLocaleString("en-IN")}
                helper={`${data.trips.rejected} driver-rejected`}
              />
            </div>
            {data.trips.cancelled > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard label="Cancelled by Driver" value={data.trips.cancel_by.driver.toLocaleString("en-IN")} />
                <KpiCard label="Cancelled by Consigner" value={data.trips.cancel_by.consigner.toLocaleString("en-IN")} />
                <KpiCard label="Cancelled by Admin" value={data.trips.cancel_by.admin.toLocaleString("en-IN")} />
                <KpiCard label="Cancelled by System" value={data.trips.cancel_by.system.toLocaleString("en-IN")} />
              </div>
            ) : null}
          </section>

          <AnalyticsCharts data={data} />
        </>
      )}
    </div>
  );
}
