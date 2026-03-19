"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listDeliveryRequests } from "@/lib/api/delivery-requests";
import type { AuctionListItem } from "@/lib/api/delivery-requests";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { VEHICLE_TYPE_LABELS, DELIVERY_REQUEST_STATUS_LABELS } from "@/lib/types";
import type { DeliveryRequestStatus, VehicleTypeRequired } from "@/lib/types";
import { Search, ArrowLeft, PackagePlus, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  trip_created: "bg-green-100 text-green-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  incomplete: "bg-gray-100 text-gray-600",
  expired: "bg-gray-100 text-gray-600",
};

function prettify(s: string) { return s.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" "); }

const TERMINAL_STATUSES = ["completed", "cancelled", "trip_created"] as const;
const PAGE_SIZE = 50;

export default function AuctionHistoryPage() {
  const [tab, setTab] = useState<"erp" | "app">("erp");

  return (
    <>
      <Link href="/delivery-requests" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Active Auctions
      </Link>

      <PageHeader title="Auction History" description="Completed, cancelled and trip-created auctions" />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "erp" | "app")}>
        <TabsList className="bg-gray-100 h-8">
          <TabsTrigger value="erp" className="text-xs h-7 data-[state=active]:bg-white">ERP</TabsTrigger>
          <TabsTrigger value="app" className="text-xs h-7 data-[state=active]:bg-white">App</TabsTrigger>
        </TabsList>

        <TabsContent value="erp" className="mt-4">
          <HistoryTab source="erp" />
        </TabsContent>
        <TabsContent value="app" className="mt-4">
          <HistoryTab source="app" />
        </TabsContent>
      </Tabs>
    </>
  );
}

function HistoryTab({ source }: { source: "erp" | "app" }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [offset, setOffset] = useState(0);

  // Fetch each terminal status separately and merge for "all"
  const queries = TERMINAL_STATUSES.map((s) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
      queryKey: queryKeys.deliveryRequests({ search: debouncedSearch || undefined, status: s, source, limit: PAGE_SIZE, offset }),
      queryFn: () => listDeliveryRequests({ search: debouncedSearch || undefined, status: s, source, limit: PAGE_SIZE, offset }),
      enabled: statusFilter === "all" || statusFilter === s,
    })
  );

  const items = useMemo(() => {
    if (statusFilter !== "all") {
      const idx = TERMINAL_STATUSES.indexOf(statusFilter as typeof TERMINAL_STATUSES[number]);
      return idx >= 0 ? (queries[idx].data?.items ?? []) : [];
    }
    return queries
      .flatMap((q) => q.data?.items ?? [])
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [statusFilter, ...queries.map((q) => q.data)]);

  const total = queries.reduce((s, q) => s + (q.data?.total ?? 0), 0);
  const isLoading = queries.some((q) => q.isLoading);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Search..." value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); setTimeout(() => setDebouncedSearch(e.target.value), 300); }}
            className="pl-9 h-9 text-sm" />
        </div>
        <div className="flex gap-1.5">
          {(["all", ...TERMINAL_STATUSES] as const).map((s) => (
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
        <Card><CardContent className="p-6 text-center">
          <PackagePlus className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No {source === "erp" ? "ERP" : "app"} auction history</p>
        </CardContent></Card>
      ) : (
        <>
          <div className="hidden sm:block">
            <Card><div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Request #</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Route</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Vehicle</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Bids</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Lowest</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Consigner</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/delivery-requests/${item.id}`} className="font-medium text-blue-600 hover:underline">{item.request_number}</Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{item.pickup_city} → {item.delivery_city}</td>
                      <td className="px-4 py-3 text-gray-600">{VEHICLE_TYPE_LABELS[item.vehicle_type as VehicleTypeRequired] ?? item.vehicle_type}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`border-0 font-medium text-xs ${STATUS_COLORS[item.status] ?? "bg-gray-100 text-gray-700"}`}>
                          {DELIVERY_REQUEST_STATUS_LABELS[item.status as DeliveryRequestStatus] ?? prettify(item.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{item.total_bids_count}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{item.lowest_bid_amount ? formatCurrency(item.lowest_bid_amount) : "—"}</td>
                      <td className="px-4 py-3 text-gray-600">{item.consigner_name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></Card>
          </div>

          <div className="sm:hidden space-y-2">
            {items.map((item) => (
              <Link key={item.id} href={`/delivery-requests/${item.id}`}>
                <Card className="hover:bg-gray-50 transition-colors">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">{item.request_number}</span>
                      <Badge variant="outline" className={`border-0 text-xs ${STATUS_COLORS[item.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {DELIVERY_REQUEST_STATUS_LABELS[item.status as DeliveryRequestStatus] ?? prettify(item.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-700">{item.pickup_city} → {item.delivery_city}</p>
                    <div className="flex gap-2 text-xs text-gray-500 mt-1">
                      <span>{item.total_bids_count} bids</span>
                      {item.lowest_bid_amount && <><span>·</span><span>{formatCurrency(item.lowest_bid_amount)}</span></>}
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
    </div>
  );
}
