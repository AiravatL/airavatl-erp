"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { useAuth } from "@/lib/auth/auth-context";
import { listTripHistory } from "@/lib/api/trips";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { ArrowLeft, Download, Search } from "lucide-react";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";

export default function TripHistoryPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const historyQuery = useQuery({
    queryKey: queryKeys.tripHistory({
      search,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    }),
    queryFn: () =>
      listTripHistory({
        search: search || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: 200,
      }),
    enabled: !!user,
  });

  const trips = historyQuery.data ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader title="Trip History" description={historyQuery.isLoading ? "Loading..." : `${trips.length} completed trips`}>
        <div className="flex items-center gap-2">
          <Link href="/trips">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> Active Trips
            </Button>
          </Link>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="Search trip code, customer, route..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 pl-8 text-sm"
            maxLength={FIELD_LIMITS.search}
          />
        </div>
        <Input
          type="date"
          value={fromDate}
          onChange={(event) => setFromDate(event.target.value)}
          className="h-8 text-xs"
        />
        <Input
          type="date"
          value={toDate}
          onChange={(event) => setToDate(event.target.value)}
          className="h-8 text-xs"
        />
      </div>

      {historyQuery.isLoading && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Loading trip history...</p>
          </CardContent>
        </Card>
      )}

      {!historyQuery.isLoading && historyQuery.isError && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">
              {historyQuery.error instanceof Error ? historyQuery.error.message : "Unable to fetch trip history"}
            </p>
          </CardContent>
        </Card>
      )}

      {!historyQuery.isLoading && !historyQuery.isError && (
        <div className="space-y-2">
          {trips.map((trip) => (
            <Link key={trip.id} href={`/trips/${trip.id}`}>
              <Card className="hover:bg-gray-50/60 transition-colors">
                <CardContent className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{trip.tripCode}</span>
                      <Badge variant="outline" className="text-[10px] border-emerald-200 text-emerald-700">
                        Closed
                      </Badge>
                    </div>
                    <span className="text-xs text-gray-500">
                      Closed: {trip.completedAt ? formatDate(trip.completedAt) : formatDate(trip.updatedAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-700">{trip.customerName}</p>
                  <p className="text-xs text-gray-500">{trip.route || "—"}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
                    <span>{trip.vehicleNumber || "No vehicle"}</span>
                    <span>{trip.driverName || "No driver"}</span>
                    {trip.tripAmount ? <span className="font-medium text-gray-700">{formatCurrency(trip.tripAmount)}</span> : null}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}

          {trips.length === 0 && (
            <Card>
              <CardContent className="p-4 text-center text-sm text-gray-400">
                No completed trips found
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
