"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { listTrips } from "@/lib/api/trips";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { TRIP_STAGE_LABELS, TRIP_STAGES, type TripStage } from "@/lib/types";
import { FIELD_LIMITS } from "@/lib/validation/client/field-limits";
import { Plus, Search, Download } from "lucide-react";

export default function TripsListPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");

  const tripsQuery = useQuery({
    queryKey: queryKeys.trips({ search, stage: stageFilter }),
    queryFn: () =>
      listTrips({
        search: search || undefined,
        stage: stageFilter !== "all" ? (stageFilter as TripStage) : undefined,
        limit: 200,
      }),
    enabled: !!user,
  });

  const trips = tripsQuery.data ?? [];

  const canCreateRequest =
    user?.role === "sales_consigner" ||
    user?.role === "operations_consigner" ||
    user?.role === "admin" ||
    user?.role === "super_admin";

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader title="Trips" description={tripsQuery.isLoading ? "Loading..." : `${trips.length} active trips`}>
        <div className="flex items-center gap-2">
          <Link href="/trips/history">
            <Button size="sm" variant="outline" className="h-8 text-xs">
              Trip History
            </Button>
          </Link>
          {canCreateRequest && (
            <Link href="/trips/new">
              <Button size="sm" className="h-8 text-xs gap-1.5">
                <Plus className="h-3.5 w-3.5" /> New Trip Request
              </Button>
            </Link>
          )}
        </div>
      </PageHeader>

      {/* Search + Filter bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="Search trips, customers, routes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-sm"
            maxLength={FIELD_LIMITS.search}
          />
        </div>
        <div className="flex gap-2">
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="All stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {TRIP_STAGES.filter((s) => s !== "closed").map((s) => (
                <SelectItem key={s} value={s}>
                  {TRIP_STAGE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
      </div>

      {tripsQuery.isLoading && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-gray-500">Loading trips...</p>
          </CardContent>
        </Card>
      )}

      {!tripsQuery.isLoading && tripsQuery.isError && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-600">
              {tripsQuery.error instanceof Error ? tripsQuery.error.message : "Unable to fetch trips"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Desktop table */}
      {!tripsQuery.isLoading && !tripsQuery.isError && (
        <div className="hidden sm:block">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Trip Code</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Customer</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Route</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Status</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Amount</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Vehicle</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Schedule</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Ops Owner</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {trips.map((trip) => (
                      <tr
                        key={trip.id}
                        role="link"
                        tabIndex={0}
                        aria-label={`Open trip ${trip.tripCode}`}
                        className="cursor-pointer hover:bg-gray-50/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                        onClick={() => router.push(`/trips/${trip.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            router.push(`/trips/${trip.id}`);
                          }
                        }}
                      >
                        <td className="px-4 py-3">
                          <span className="font-medium text-blue-600">{trip.tripCode}</span>
                          {trip.leasedFlag && (
                            <Badge
                              variant="outline"
                              className="ml-1.5 text-[10px] px-1 py-0 border-indigo-200 text-indigo-600"
                            >
                              L
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{trip.customerName}</td>
                        <td className="px-4 py-3 text-gray-500">{trip.route || "—"}</td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            status={trip.currentStage}
                            label={TRIP_STAGE_LABELS[trip.currentStage]}
                            variant="stage"
                          />
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {trip.tripAmount ? formatCurrency(trip.tripAmount) : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{trip.vehicleNumber || "—"}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {trip.scheduleDate ? formatDate(trip.scheduleDate) : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {trip.opsOwnerName || (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-200 text-amber-600">
                              Pending
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                    {trips.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                          No trips found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Mobile card view */}
      {!tripsQuery.isLoading && !tripsQuery.isError && (
        <div className="sm:hidden space-y-2">
          {trips.map((trip) => (
            <Link key={trip.id} href={`/trips/${trip.id}`}>
              <Card className="hover:bg-gray-50/50 transition-colors">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-gray-900">{trip.tripCode}</span>
                      {trip.leasedFlag && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 border-indigo-200 text-indigo-600">
                          L
                        </Badge>
                      )}
                    </div>
                    <StatusBadge
                      status={trip.currentStage}
                      label={TRIP_STAGE_LABELS[trip.currentStage]}
                      variant="stage"
                    />
                  </div>
                  <p className="text-xs text-gray-700 mb-0.5">{trip.customerName}</p>
                  <p className="text-xs text-gray-500">{trip.route || "—"}</p>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                    <span>{trip.vehicleNumber || "No vehicle"}</span>
                    <span>{trip.scheduleDate ? formatDate(trip.scheduleDate) : "—"}</span>
                    {trip.tripAmount ? (
                      <span className="text-gray-600 font-medium">{formatCurrency(trip.tripAmount)}</span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {trips.length === 0 && (
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-sm text-gray-400">No trips found</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
