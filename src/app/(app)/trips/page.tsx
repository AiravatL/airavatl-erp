"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/reports/kpi-card";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listAppTrips, type AppTripItem } from "@/lib/api/app-reports";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { useAuth } from "@/lib/auth/auth-context";
import { APP_TRIP_STATUS_LABELS } from "@/lib/types";
import type { AppTripStatus } from "@/lib/types";
import { Search, Truck, Loader2, ChevronLeft, ChevronRight, History } from "lucide-react";

const STATUS_COLORS: Record<AppTripStatus, string> = {
  pending: "bg-gray-100 text-gray-700",
  waiting_driver_acceptance: "bg-amber-100 text-amber-700",
  driver_assigned: "bg-blue-100 text-blue-700",
  en_route_to_pickup: "bg-cyan-100 text-cyan-700",
  at_pickup: "bg-cyan-100 text-cyan-700",
  loading: "bg-indigo-100 text-indigo-700",
  in_transit: "bg-purple-100 text-purple-700",
  at_delivery: "bg-purple-100 text-purple-700",
  unloading: "bg-violet-100 text-violet-700",
  waiting_for_advance: "bg-amber-100 text-amber-700",
  waiting_for_final: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  driver_rejected: "bg-red-100 text-red-700",
};

function prettify(s: string) { return s.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" "); }

const ACTIVE_STATUSES = Object.entries(APP_TRIP_STATUS_LABELS)
  .filter(([key]) => !["completed", "cancelled", "driver_rejected"].includes(key));

const OPS_ROLES = new Set(["operations"]);
const PAGE_SIZE = 50;

export default function TripsListPage() {
  const { user } = useAuth();
  const isOps = user ? OPS_ROLES.has(user.role) : false;
  const isAdmin = user?.role === "super_admin" || user?.role === "admin";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);

  const filters = useMemo(() => ({
    search: debouncedSearch || undefined,
    status: status || undefined,
    limit: PAGE_SIZE,
    offset,
  }), [debouncedSearch, status, offset]);

  const query = useQuery({
    queryKey: queryKeys.appTrips(filters),
    queryFn: () => listAppTrips(filters),
  });

  const TERMINAL = new Set(["completed", "cancelled", "driver_rejected"]);
  const allItems = query.data?.items ?? [];
  // If no specific status filter, hide terminal trips (they belong in history)
  const items = status ? allItems : allItems.filter((t) => !TERMINAL.has(t.status));
  const total = status ? (query.data?.total ?? 0) : items.length;
  const active = items.filter((t) => !TERMINAL.has(t.status)).length;

  return (
    <>
      <PageHeader title="Trips" description={`${total} trip${total !== 1 ? "s" : ""}`}>
        {isAdmin && (
          <Link href="/trips/history">
            <Button variant="outline" className="h-9 text-sm">
              <History className="h-4 w-4 mr-1.5" /> Trip History
            </Button>
          </Link>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Total Trips" value={total.toLocaleString("en-IN")} />
        <KpiCard label="Active" value={active.toLocaleString("en-IN")} />
        <KpiCard label="In Transit" value={items.filter((t) => t.status === "in_transit").length.toLocaleString("en-IN")} />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Search by trip #, city, driver..." value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); setTimeout(() => setDebouncedSearch(e.target.value), 300); }}
            className="pl-9 h-9 text-sm" />
        </div>
        <Select value={status || "all"} onValueChange={(v) => { setStatus(v === "all" ? "" : v); setOffset(0); }}>
          <SelectTrigger className="w-full sm:w-[200px] h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {ACTIVE_STATUSES.map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {query.isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : query.isError ? (
        <Card><CardContent className="p-4 text-sm text-red-600">{query.error instanceof Error ? query.error.message : "Error"}</CardContent></Card>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6 text-center">
          <Truck className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No trips found</p>
        </CardContent></Card>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden sm:block">
            <Card><div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Trip #</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Route</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Consigner</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Driver</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  {!isOps && <th className="px-4 py-3 text-right font-medium text-gray-500">Amount</th>}
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => window.location.href = `/trips/${item.id}`}>
                      <td className="px-4 py-3">
                        <Link href={`/trips/${item.id}`} className="font-medium text-blue-600 hover:underline">{item.tripNumber}</Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{item.pickupCity} → {item.deliveryCity}</td>
                      <td className="px-4 py-3 text-gray-700">{item.consignerName}</td>
                      <td className="px-4 py-3 text-gray-700">{item.driverName ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`border-0 font-medium text-xs ${STATUS_COLORS[item.status as AppTripStatus] ?? "bg-gray-100 text-gray-700"}`}>
                          {prettify(item.status)}
                        </Badge>
                      </td>
                      {!isOps && <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.tripAmount)}</td>}
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></Card>
          </div>

          {/* Mobile Cards */}
          <div className="sm:hidden space-y-2">
            {items.map((item) => (
              <Link key={item.id} href={`/trips/${item.id}`}>
              <Card className="hover:bg-gray-50/50 transition-colors">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">{item.tripNumber}</span>
                    <Badge variant="outline" className={`border-0 font-medium text-xs ${STATUS_COLORS[item.status as AppTripStatus] ?? "bg-gray-100 text-gray-700"}`}>
                      {prettify(item.status)}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-700 mb-1">{item.pickupCity} → {item.deliveryCity}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{item.consignerName}</span>
                    {item.driverName && <><span>·</span><span>{item.driverName}</span></>}
                    {!isOps && <><span>·</span><span>{formatCurrency(item.tripAmount)}</span></>}
                  </div>
                </CardContent>
              </Card>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
