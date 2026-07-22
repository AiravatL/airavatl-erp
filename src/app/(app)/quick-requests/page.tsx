"use client";

// Quick Requests — fixed-price delivery requests (request_type = 'instant').
// ERP sets the driver payout + consigner amount up front; drivers accept in
// the partner app and ops picks one acceptor on the detail page.

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listDeliveryRequests } from "@/lib/api/delivery-requests";
import type { AuctionListItem } from "@/lib/api/delivery-requests";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { VEHICLE_TYPE_LABELS, DELIVERY_REQUEST_STATUS_LABELS } from "@/lib/types";
import type { DeliveryRequestStatus, VehicleTypeRequired } from "@/lib/types";
import { Plus, Search, Zap, Loader2, ChevronLeft, ChevronRight, History } from "lucide-react";

// Only open work here — done/cancelled requests live in /quick-requests/history.
const STATUS_FILTERS = ["active", "ended"] as const;
const TERMINAL = new Set(["cancelled", "trip_created", "incomplete"]);

const STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-100 text-blue-700",
  ended: "bg-amber-100 text-amber-700",
  winner_selected: "bg-purple-100 text-purple-700",
  trip_created: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  incomplete: "bg-gray-100 text-gray-600",
};

const prettify = (s: string) =>
  s.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");

const PAGE_SIZE = 50;

export default function QuickRequestsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);

  const filters = useMemo(() => ({
    search: debouncedSearch || undefined,
    status: status || undefined,
    requestType: "instant",
    limit: PAGE_SIZE,
    offset,
  }), [debouncedSearch, status, offset]);

  const query = useQuery({
    queryKey: queryKeys.deliveryRequests({ ...filters }),
    queryFn: () => listDeliveryRequests(filters),
    staleTime: 15_000,
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
  });

  const allItems = query.data?.items ?? [];
  // With no explicit status filter, hide terminal rows (pick them via filters).
  const items = status ? allItems : allItems.filter((i) => !TERMINAL.has(i.status));
  const total = query.data?.total ?? 0;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader
        title="Quick Requests"
        description="Fixed-price requests — drivers accept, you pick one"
      >
        <Link href="/quick-requests/history">
          <Button variant="outline" className="h-9 text-sm">
            <History className="h-4 w-4 mr-1.5" /> History
          </Button>
        </Link>
        <Button onClick={() => router.push("/quick-requests/new")} className="h-9 text-sm">
          <Plus className="h-4 w-4 mr-1.5" /> New Quick Request
        </Button>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search request #, city, consigner..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Button variant={!status ? "default" : "outline"} size="sm" className="h-9 text-xs"
            onClick={() => { setStatus(""); setOffset(0); }}>Open</Button>
          {STATUS_FILTERS.map((s) => (
            <Button key={s} variant={status === s ? "default" : "outline"} size="sm" className="h-9 text-xs"
              onClick={() => { setStatus(s); setOffset(0); }}>
              {DELIVERY_REQUEST_STATUS_LABELS[s as DeliveryRequestStatus] ?? prettify(s)}
            </Button>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : query.error ? (
        <Card><CardContent className="p-4 text-sm text-red-600">
          {query.error instanceof Error ? query.error.message : "Error"}
        </CardContent></Card>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-6 text-center">
          <Zap className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No quick requests{status ? "" : " open"} yet</p>
        </CardContent></Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block">
            <Card><div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Request #</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Route</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Vehicle</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Payout</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Acceptors</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Deadline</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Consigner</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((item) => (
                    <QuickRequestRow key={item.id} item={item} />
                  ))}
                </tbody>
              </table>
            </div></Card>
          </div>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {items.map((item) => (
              <Link key={item.id} href={`/quick-requests/${item.id}`}>
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
                      {item.fixed_driver_amount != null && (
                        <span className="font-medium text-gray-900">{formatCurrency(item.fixed_driver_amount)}</span>
                      )}
                      <span>·</span><span>{item.total_bids_count} accepted</span>
                      {item.auction_end_time && (
                        <><span>·</span><span>ends {formatDate(item.auction_end_time)}</span></>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function QuickRequestRow({ item }: { item: AuctionListItem }) {
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <Link href={`/quick-requests/${item.id}`} className="font-medium text-blue-600 hover:underline">
          {item.request_number}
        </Link>
      </td>
      <td className="px-4 py-3 text-gray-700">{item.pickup_city} → {item.delivery_city}</td>
      <td className="px-4 py-3 text-gray-600">
        {VEHICLE_TYPE_LABELS[item.vehicle_type as VehicleTypeRequired] ?? item.vehicle_type}
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className={`border-0 font-medium text-xs ${STATUS_COLORS[item.status] ?? "bg-gray-100 text-gray-700"}`}>
          {DELIVERY_REQUEST_STATUS_LABELS[item.status as DeliveryRequestStatus] ?? prettify(item.status)}
        </Badge>
      </td>
      <td className="px-4 py-3 text-right font-medium text-gray-900">
        {item.fixed_driver_amount != null ? formatCurrency(item.fixed_driver_amount) : "—"}
      </td>
      <td className="px-4 py-3 text-right text-gray-700">{item.total_bids_count}</td>
      <td className="px-4 py-3 text-gray-500 text-xs">
        {item.auction_end_time ? formatDate(item.auction_end_time) : "—"}
      </td>
      <td className="px-4 py-3 text-gray-600">{item.consigner_name}</td>
    </tr>
  );
}
