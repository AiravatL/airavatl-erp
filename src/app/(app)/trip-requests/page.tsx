"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listTripRequests } from "@/lib/api/trip-requests";
import type { TripRequestListItem, TripRequestStatus } from "@/lib/api/trip-requests";
import { queryKeys } from "@/lib/query/keys";
import { formatDate } from "@/lib/formatters";
import {
  Plus, Search, Loader2, ChevronLeft, ChevronRight, ClipboardList,
} from "lucide-react";

const STATUS_TABS: { value: TripRequestStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "pending_review", label: "Pending" },
  { value: "converted", label: "Converted" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS: Record<TripRequestStatus, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  converted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

const STATUS_LABELS: Record<TripRequestStatus, string> = {
  pending_review: "Pending",
  converted: "Converted",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const PAGE_SIZE = 50;

export default function TripRequestsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<TripRequestStatus | "">("pending_review");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [offset, setOffset] = useState(0);

  const filters = useMemo(
    () => ({
      status: status || undefined,
      search: debouncedSearch || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    [status, debouncedSearch, offset],
  );

  const query = useQuery({
    queryKey: queryKeys.tripRequests({ ...filters }),
    queryFn: () => listTripRequests(filters),
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  return (
    <>
      <PageHeader title="Trip Requests" description="Lightweight requests from enterprise clients & consigner sales">
        <Button onClick={() => router.push("/trip-requests/new")} className="h-9 text-sm">
          <Plus className="h-4 w-4 mr-1.5" /> New Request
        </Button>
      </PageHeader>

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search request #, city, consigner…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_TABS.map((tab) => (
              <Button
                key={tab.value || "all"}
                variant={status === tab.value ? "default" : "outline"}
                size="sm"
                className="h-9 text-xs"
                onClick={() => {
                  setStatus(tab.value);
                  setOffset(0);
                }}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        <ListState
          loading={query.isLoading}
          error={query.error}
          empty={items.length === 0}
        />

        {items.length > 0 && (
          <>
            <Card>
              <div className="overflow-x-auto hidden sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Request #</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Source</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Route</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Consigner</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Cargo</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.map((item) => (
                      <TripRequestRow key={item.id} item={item} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="sm:hidden divide-y divide-gray-50">
                {items.map((item) => (
                  <TripRequestCard key={item.id} item={item} />
                ))}
              </div>
            </Card>
            <Pagination total={total} offset={offset} onOffsetChange={setOffset} />
          </>
        )}
      </div>
    </>
  );
}

function TripRequestRow({ item }: { item: TripRequestListItem }) {
  const route = [
    item.pickup_city ?? item.pickup_address,
    item.delivery_city ?? item.delivery_address,
  ].join(" → ");
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <Link href={`/trip-requests/${item.id}`} className="font-medium text-blue-600 hover:underline">
          {item.request_number}
        </Link>
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className={`border-0 text-[10px] font-medium ${
          item.source === "enterprise_portal" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
        }`}>
          {item.source === "enterprise_portal" ? "Portal" : "Sales"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-gray-700 truncate max-w-[220px]" title={route}>{route}</td>
      <td className="px-4 py-3 text-gray-600 truncate max-w-[180px]" title={item.consigner_display ?? ""}>
        {item.consigner_display ?? "—"}
      </td>
      <td className="px-4 py-3 text-gray-600 truncate max-w-[200px]" title={item.cargo_description}>
        {item.cargo_description}
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className={`border-0 text-xs font-medium ${STATUS_COLORS[item.status]}`}>
          {STATUS_LABELS[item.status]}
        </Badge>
      </td>
      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(item.created_at)}</td>
    </tr>
  );
}

function TripRequestCard({ item }: { item: TripRequestListItem }) {
  return (
    <Link href={`/trip-requests/${item.id}`}>
      <div className="p-3 hover:bg-gray-50">
        <div className="flex items-start justify-between mb-1">
          <span className="text-sm font-medium text-gray-900">{item.request_number}</span>
          <Badge variant="outline" className={`border-0 text-xs ${STATUS_COLORS[item.status]}`}>
            {STATUS_LABELS[item.status]}
          </Badge>
        </div>
        <p className="text-sm text-gray-700">
          {item.pickup_city ?? item.pickup_address} → {item.delivery_city ?? item.delivery_address}
        </p>
        <div className="flex gap-2 text-xs text-gray-500 mt-1">
          <span>{item.source === "enterprise_portal" ? "Portal" : "Sales"}</span>
          {item.consigner_display && (
            <>
              <span>·</span>
              <span className="truncate">{item.consigner_display}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

function Pagination({
  total, offset, onOffsetChange,
}: { total: number; offset: number; onOffsetChange: (v: number) => void }) {
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-gray-500">
        Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={offset === 0}
          onClick={() => onOffsetChange(Math.max(0, offset - PAGE_SIZE))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total}
          onClick={() => onOffsetChange(offset + PAGE_SIZE)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ListState({
  loading, error, empty,
}: { loading: boolean; error: unknown; empty: boolean }) {
  if (loading)
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  if (error)
    return (
      <Card>
        <CardContent className="p-4 text-sm text-red-600">
          {error instanceof Error ? error.message : "Error"}
        </CardContent>
      </Card>
    );
  if (empty)
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <ClipboardList className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No trip requests yet</p>
        </CardContent>
      </Card>
    );
  return null;
}
