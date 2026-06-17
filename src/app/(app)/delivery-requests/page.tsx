"use client";

import { useState, useMemo } from "react";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/reports/kpi-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
// Select removed — using button filters instead
import { listDeliveryRequests, getDeliveryRequestStats } from "@/lib/api/delivery-requests";
import { AuctionRowMenu } from "@/components/shared/auction-row-menu";
import type { AuctionListItem } from "@/lib/api/delivery-requests";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { VEHICLE_TYPE_LABELS, DELIVERY_REQUEST_STATUS_LABELS } from "@/lib/types";
import type { DeliveryRequestStatus, VehicleTypeRequired } from "@/lib/types";
import { Plus, Search, PackagePlus, Loader2, ChevronLeft, ChevronRight, History } from "lucide-react";

const AUCTION_PAGE_STATUSES = ["active", "ended", "winner_selected"] as const;
const TERMINAL = new Set(["cancelled", "trip_created", "incomplete"]);
const prettifyStatus = (s: string) => s === "winner_selected" ? "Winner Selected" : s.charAt(0).toUpperCase() + s.slice(1);

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-blue-100 text-blue-700",
  ended: "bg-green-100 text-green-700",
  winner_selected: "bg-purple-100 text-purple-700",
  trip_created: "bg-green-100 text-green-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  incomplete: "bg-gray-100 text-gray-600",
  open: "bg-blue-100 text-blue-700",
  bidding: "bg-amber-100 text-amber-700",
  awarded: "bg-emerald-100 text-emerald-700",
  expired: "bg-gray-100 text-gray-600",
};

function prettify(s: string) { return s.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" "); }

const PAGE_SIZE = 50;

export default function DeliveryRequestsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"erp" | "app" | "enterprise">("erp");

  // KPI counts come from a dedicated RPC so they stay stable as the user
  // changes search / status filters on the list below.
  const statsQuery = useQuery({
    queryKey: queryKeys.deliveryRequestStats,
    queryFn: getDeliveryRequestStats,
    staleTime: 30_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
  const erpStats = statsQuery.data?.erp ?? { open: 0, active: 0 };
  const appStats = statsQuery.data?.app ?? { open: 0, active: 0 };
  const enterpriseStats = statsQuery.data?.enterprise ?? { open: 0, active: 0 };

  // ERP state
  const [erpSearch, setErpSearch] = useState("");
  const erpDebouncedSearch = useDebouncedValue(erpSearch, 300);
  const [erpStatus, setErpStatus] = useState("");
  const [erpOffset, setErpOffset] = useState(0);

  const erpFilters = useMemo(() => ({
    search: erpDebouncedSearch || undefined,
    status: erpStatus || undefined,
    source: "erp" as const,
    limit: PAGE_SIZE,
    offset: erpOffset,
  }), [erpDebouncedSearch, erpStatus, erpOffset]);


  const erpQuery = useQuery({
    queryKey: queryKeys.deliveryRequests({ ...erpFilters }),
    queryFn: () => listDeliveryRequests(erpFilters),
    enabled: tab === "erp",
    staleTime: 30_000,
    refetchInterval: tab === "erp" ? 30_000 : false,
    placeholderData: keepPreviousData,
  });
  // Filter out terminal statuses (those belong in history)
  const erpAllItems = erpQuery.data?.items ?? [];
  const erpItems = erpStatus ? erpAllItems : erpAllItems.filter((i) => !TERMINAL.has(i.status));

  // App state
  const [appSearch, setAppSearch] = useState("");
  const appDebouncedSearch = useDebouncedValue(appSearch, 300);
  const [appStatus, setAppStatus] = useState("");
  const [appOffset, setAppOffset] = useState(0);

  const appFilters = useMemo(() => ({
    search: appDebouncedSearch || undefined,
    status: appStatus || undefined,
    source: "app" as const,
    limit: PAGE_SIZE,
    offset: appOffset,
  }), [appDebouncedSearch, appStatus, appOffset]);

  const appQuery = useQuery({
    queryKey: queryKeys.deliveryRequests({ ...appFilters }),
    queryFn: () => listDeliveryRequests(appFilters),
    enabled: tab === "app",
    staleTime: 30_000,
    refetchInterval: tab === "app" ? 30_000 : false,
    placeholderData: keepPreviousData,
  });
  const appAllItems = appQuery.data?.items ?? [];
  const appItems = appStatus ? appAllItems : appAllItems.filter((i) => !TERMINAL.has(i.status));

  // Enterprise state (consigner-operated auctions — ERP monitors only)
  const [entSearch, setEntSearch] = useState("");
  const entDebouncedSearch = useDebouncedValue(entSearch, 300);
  const [entStatus, setEntStatus] = useState("");
  const [entOffset, setEntOffset] = useState(0);

  const entFilters = useMemo(() => ({
    search: entDebouncedSearch || undefined,
    status: entStatus || undefined,
    source: "enterprise" as const,
    limit: PAGE_SIZE,
    offset: entOffset,
  }), [entDebouncedSearch, entStatus, entOffset]);

  const entQuery = useQuery({
    queryKey: queryKeys.deliveryRequests({ ...entFilters }),
    queryFn: () => listDeliveryRequests(entFilters),
    enabled: tab === "enterprise",
    staleTime: 30_000,
    refetchInterval: tab === "enterprise" ? 30_000 : false,
    placeholderData: keepPreviousData,
  });
  const entAllItems = entQuery.data?.items ?? [];
  const entItems = entStatus ? entAllItems : entAllItems.filter((i) => !TERMINAL.has(i.status));

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader title="Auctions" description="Active delivery request auctions">
        <Link href="/delivery-requests/history">
          <Button variant="outline" className="h-9 text-sm">
            <History className="h-4 w-4 mr-1.5" /> History
          </Button>
        </Link>
        <Button onClick={() => router.push("/delivery-requests/new")} className="h-9 text-sm">
          <Plus className="h-4 w-4 mr-1.5" /> New Request
        </Button>
      </PageHeader>

      <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
        <KpiCard label="ERP Auctions" value={erpStats.open.toLocaleString("en-IN")} />
        <KpiCard label="App Auctions" value={appStats.open.toLocaleString("en-IN")} />
        <KpiCard label="Enterprise Auctions" value={enterpriseStats.open.toLocaleString("en-IN")} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "erp" | "app" | "enterprise")}>
        <TabsList className="bg-gray-100 h-8">
          <TabsTrigger value="erp" className="text-xs h-7 data-[state=active]:bg-white">ERP ({erpStats.open})</TabsTrigger>
          <TabsTrigger value="app" className="text-xs h-7 data-[state=active]:bg-white">App ({appStats.open})</TabsTrigger>
          <TabsTrigger value="enterprise" className="text-xs h-7 data-[state=active]:bg-white">Enterprise ({enterpriseStats.open})</TabsTrigger>
        </TabsList>

        {/* ERP Tab */}
        <TabsContent value="erp" className="mt-4 space-y-3">
          <AuctionListPanel
            items={erpItems} total={erpQuery.data?.total ?? 0}
            loading={erpQuery.isLoading} error={erpQuery.error}
            search={erpSearch} onSearchChange={(v) => { setErpSearch(v); setErpOffset(0); }}
            status={erpStatus} onStatusChange={(v) => { setErpStatus(v); setErpOffset(0); }}
            offset={erpOffset} onOffsetChange={setErpOffset}
            searchPlaceholder="Search request #, city, consigner..." emptyLabel="No ERP auctions yet" />
        </TabsContent>

        {/* App Tab */}
        <TabsContent value="app" className="mt-4 space-y-3">
          <AuctionListPanel
            items={appItems} total={appQuery.data?.total ?? 0}
            loading={appQuery.isLoading} error={appQuery.error}
            search={appSearch} onSearchChange={(v) => { setAppSearch(v); setAppOffset(0); }}
            status={appStatus} onStatusChange={(v) => { setAppStatus(v); setAppOffset(0); }}
            offset={appOffset} onOffsetChange={setAppOffset}
            searchPlaceholder="Search request #, city..." emptyLabel="No app auctions found" />
        </TabsContent>

        {/* Enterprise Tab — consigner-operated auctions, ERP monitors only */}
        <TabsContent value="enterprise" className="mt-4 space-y-3">
          <AuctionListPanel
            items={entItems} total={entQuery.data?.total ?? 0}
            loading={entQuery.isLoading} error={entQuery.error}
            search={entSearch} onSearchChange={(v) => { setEntSearch(v); setEntOffset(0); }}
            status={entStatus} onStatusChange={(v) => { setEntStatus(v); setEntOffset(0); }}
            offset={entOffset} onOffsetChange={setEntOffset}
            searchPlaceholder="Search request #, city, consigner..." emptyLabel="No enterprise auctions yet" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SourceBadge({ item }: { item: AuctionListItem }) {
  if (item.is_enterprise) {
    return <Badge variant="outline" className="ml-1.5 border-0 font-medium text-[10px] bg-violet-100 text-violet-700">Enterprise</Badge>;
  }
  return (
    <Badge variant="outline" className={`ml-1.5 border-0 font-medium text-[10px] ${item.source === "erp" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
      {item.source === "erp" ? "ERP" : "APP"}
    </Badge>
  );
}

function AuctionListPanel({
  items, total, loading, error, search, onSearchChange, status, onStatusChange,
  offset, onOffsetChange, searchPlaceholder, emptyLabel,
}: {
  items: AuctionListItem[];
  total: number;
  loading: boolean;
  error: unknown;
  search: string;
  onSearchChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
  offset: number;
  onOffsetChange: (v: number) => void;
  searchPlaceholder: string;
  emptyLabel: string;
}) {
  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input placeholder={searchPlaceholder} value={search}
            onChange={(e) => onSearchChange(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <div className="flex gap-1.5">
          <Button variant={!status ? "default" : "outline"} size="sm" className="h-9 text-xs"
            onClick={() => onStatusChange("")}>All</Button>
          {AUCTION_PAGE_STATUSES.map((s) => (
            <Button key={s} variant={status === s ? "default" : "outline"} size="sm" className="h-9 text-xs"
              onClick={() => onStatusChange(s)}>{prettifyStatus(s)}</Button>
          ))}
        </div>
      </div>

      <ListState loading={loading} error={error} empty={items.length === 0} emptyLabel={emptyLabel} />
      {items.length > 0 && (
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
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Consigner</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/delivery-requests/${item.id}`} className="font-medium text-blue-600 hover:underline">{item.request_number}</Link>
                        <SourceBadge item={item} />
                      </td>
                      <td className="px-4 py-3 text-gray-700">{item.pickup_city} → {item.delivery_city}</td>
                      <td className="px-4 py-3 text-gray-600">{VEHICLE_TYPE_LABELS[item.vehicle_type as VehicleTypeRequired] ?? item.vehicle_type}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`border-0 font-medium text-xs ${STATUS_COLORS[item.status] ?? "bg-gray-100 text-gray-700"}`}>
                          {DELIVERY_REQUEST_STATUS_LABELS[item.status as DeliveryRequestStatus] ?? prettify(item.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{item.total_bids_count}</td>
                      <td className="px-4 py-3 text-gray-600">{item.consigner_name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(item.created_at)}</td>
                      <td className="px-4 py-3"><AuctionRowMenu auctionId={item.id} /></td>
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
                      <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                        {item.request_number}
                        {item.is_enterprise && (
                          <Badge variant="outline" className="border-0 font-medium text-[10px] bg-violet-100 text-violet-700">
                            Enterprise
                          </Badge>
                        )}
                      </span>
                      <Badge variant="outline" className={`border-0 text-xs ${STATUS_COLORS[item.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {DELIVERY_REQUEST_STATUS_LABELS[item.status as DeliveryRequestStatus] ?? prettify(item.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-700">{item.pickup_city} → {item.delivery_city}</p>
                    <div className="flex gap-2 text-xs text-gray-500 mt-1">
                      <span>{item.consigner_name}</span>
                      <span>·</span><span>{item.total_bids_count} bids</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          <Pagination total={total} offset={offset} onOffsetChange={onOffsetChange} />
        </>
      )}
    </>
  );
}

function Pagination({ total, offset, onOffsetChange }: { total: number; offset: number; onOffsetChange: (v: number) => void }) {
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-gray-500">Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => onOffsetChange(Math.max(0, offset - PAGE_SIZE))}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => onOffsetChange(offset + PAGE_SIZE)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function ListState({ loading, error, empty, emptyLabel }: { loading: boolean; error: unknown; empty: boolean; emptyLabel: string }) {
  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  if (error) return <Card><CardContent className="p-4 text-sm text-red-600">{error instanceof Error ? error.message : "Error"}</CardContent></Card>;
  if (empty) return <Card><CardContent className="p-6 text-center"><PackagePlus className="h-8 w-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">{emptyLabel}</p></CardContent></Card>;
  return null;
}
