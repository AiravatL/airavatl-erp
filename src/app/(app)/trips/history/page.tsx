"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listAppTrips, type AppTripItem } from "@/lib/api/app-reports";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { useAuth } from "@/lib/auth/auth-context";
import { Search, ArrowLeft, Truck, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

function prettify(s: string) { return s.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" "); }

const PAGE_SIZE = 50;

export default function TripHistoryPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "admin";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "cancelled">("all");
  const [offset, setOffset] = useState(0);

  const completedQuery = useQuery({
    queryKey: queryKeys.appTrips({ search: debouncedSearch || undefined, status: "completed", limit: PAGE_SIZE, offset }),
    queryFn: () => listAppTrips({ search: debouncedSearch || undefined, status: "completed", limit: PAGE_SIZE, offset }),
    enabled: isAdmin && statusFilter !== "cancelled",
  });

  const cancelledQuery = useQuery({
    queryKey: queryKeys.appTrips({ search: debouncedSearch || undefined, status: "cancelled", limit: PAGE_SIZE, offset }),
    queryFn: () => listAppTrips({ search: debouncedSearch || undefined, status: "cancelled", limit: PAGE_SIZE, offset }),
    enabled: isAdmin && statusFilter !== "completed",
  });

  const items = useMemo(() => {
    if (statusFilter === "completed") return completedQuery.data?.items ?? [];
    if (statusFilter === "cancelled") return cancelledQuery.data?.items ?? [];
    return [...(completedQuery.data?.items ?? []), ...(cancelledQuery.data?.items ?? [])]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [statusFilter, completedQuery.data, cancelledQuery.data]);

  const total = statusFilter === "completed"
    ? (completedQuery.data?.total ?? 0)
    : statusFilter === "cancelled"
      ? (cancelledQuery.data?.total ?? 0)
      : (completedQuery.data?.total ?? 0) + (cancelledQuery.data?.total ?? 0);

  const isLoading = completedQuery.isLoading || cancelledQuery.isLoading;

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader title="Trip History" description="Admin only" />
        <Card><CardContent className="p-6"><p className="text-sm text-gray-600">Trip History is available only to Admin roles.</p></CardContent></Card>
      </div>
    );
  }

  return (
    <>
      <Link href="/trips" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Active Trips
      </Link>

      <PageHeader title="Trip History" description={`${total} completed/cancelled trip${total !== 1 ? "s" : ""}`} />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Search by trip #, city..." value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); setTimeout(() => setDebouncedSearch(e.target.value), 300); }}
            className="pl-9 h-9 text-sm" />
        </div>
        <div className="flex gap-1.5">
          {(["all", "completed", "cancelled"] as const).map((s) => (
            <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm" className="h-9 text-xs"
              onClick={() => { setStatusFilter(s); setOffset(0); }}>
              {s === "all" ? "All" : prettify(s)}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6 text-center"><Truck className="h-8 w-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">No trip history</p></CardContent></Card>
      ) : (
        <>
          <div className="hidden sm:block">
            <Card><div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Trip #</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Route</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Consigner</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Driver</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Amount</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => window.location.href = `/trips/${item.id}`}>
                      <td className="px-4 py-3"><Link href={`/trips/${item.id}`} className="font-medium text-blue-600 hover:underline">{item.tripNumber}</Link></td>
                      <td className="px-4 py-3 text-gray-700">{item.pickupCity} → {item.deliveryCity}</td>
                      <td className="px-4 py-3 text-gray-700">{item.consignerName}</td>
                      <td className="px-4 py-3 text-gray-700">{item.driverName ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`border-0 font-medium text-xs ${item.status === "completed" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {prettify(item.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.tripAmount)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></Card>
          </div>

          <div className="sm:hidden space-y-2">
            {items.map((item) => (
              <Link key={item.id} href={`/trips/${item.id}`}>
              <Card className="hover:bg-gray-50/50 transition-colors">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">{item.tripNumber}</span>
                    <Badge variant="outline" className={`border-0 text-xs ${item.status === "completed" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {prettify(item.status)}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-700">{item.pickupCity} → {item.deliveryCity}</p>
                  <div className="flex gap-2 text-xs text-gray-500 mt-1">
                    <span>{item.consignerName}</span><span>·</span><span>{formatCurrency(item.tripAmount)}</span>
                  </div>
                </CardContent>
              </Card>
              </Link>
            ))}
          </div>

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
