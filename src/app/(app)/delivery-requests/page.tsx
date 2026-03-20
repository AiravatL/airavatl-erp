"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/reports/kpi-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
// Select removed — using button filters instead
import { listDeliveryRequests } from "@/lib/api/delivery-requests";
import { AuctionRowMenu } from "@/components/shared/auction-row-menu";
import type { AuctionListItem } from "@/lib/api/delivery-requests";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { VEHICLE_TYPE_LABELS, DELIVERY_REQUEST_STATUS_LABELS } from "@/lib/types";
import type { DeliveryRequestStatus, VehicleTypeRequired } from "@/lib/types";
import { Plus, Search, PackagePlus, Loader2, ChevronLeft, ChevronRight, History } from "lucide-react";

const AUCTION_PAGE_STATUSES = ["active", "ended", "winner_selected", "completed"] as const;
const TERMINAL = new Set(["cancelled", "trip_created", "incomplete"]);
const prettifyStatus = (s: string) => s === "winner_selected" ? "Winner Selected" : s.charAt(0).toUpperCase() + s.slice(1);

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-blue-100 text-blue-700",
  ended: "bg-amber-100 text-amber-700",
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
  const [tab, setTab] = useState<"erp" | "app">("erp");

  // ERP state
  const [erpSearch, setErpSearch] = useState("");
  const [erpDebouncedSearch, setErpDebouncedSearch] = useState("");
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
  });
  // Filter out terminal statuses (those belong in history)
  const erpAllItems = erpQuery.data?.items ?? [];
  const erpItems = erpStatus ? erpAllItems : erpAllItems.filter((i) => !TERMINAL.has(i.status));
  const erpTotal = erpStatus ? (erpQuery.data?.total ?? 0) : erpItems.length;

  // App state
  const [appSearch, setAppSearch] = useState("");
  const [appDebouncedSearch, setAppDebouncedSearch] = useState("");
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
  });
  const appAllItems = appQuery.data?.items ?? [];
  const appItems = appStatus ? appAllItems : appAllItems.filter((i) => !TERMINAL.has(i.status));
  const appTotal = appStatus ? (appQuery.data?.total ?? 0) : appItems.length;

  const erpActive = erpItems.filter((i) => i.status === "active").length;
  const appActive = appItems.filter((i) => i.status === "active").length;

  return (
    <>
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="ERP Auctions" value={erpTotal.toLocaleString("en-IN")} />
        <KpiCard label="App Auctions" value={appTotal.toLocaleString("en-IN")} />
        <KpiCard label="ERP Active" value={erpActive.toLocaleString("en-IN")} />
        <KpiCard label="App Active" value={appActive.toLocaleString("en-IN")} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "erp" | "app")}>
        <TabsList className="bg-gray-100 h-8">
          <TabsTrigger value="erp" className="text-xs h-7 data-[state=active]:bg-white">ERP ({erpTotal})</TabsTrigger>
          <TabsTrigger value="app" className="text-xs h-7 data-[state=active]:bg-white">App ({appTotal})</TabsTrigger>
        </TabsList>

        {/* ERP Tab */}
        <TabsContent value="erp" className="mt-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input placeholder="Search request #, city, consigner..." value={erpSearch}
                onChange={(e) => { setErpSearch(e.target.value); setErpOffset(0); setTimeout(() => setErpDebouncedSearch(e.target.value), 300); }}
                className="pl-9 h-9 text-sm" />
            </div>
            <div className="flex gap-1.5">
              <Button variant={!erpStatus ? "default" : "outline"} size="sm" className="h-9 text-xs"
                onClick={() => { setErpStatus(""); setErpOffset(0); }}>All</Button>
              {AUCTION_PAGE_STATUSES.map((s) => (
                <Button key={s} variant={erpStatus === s ? "default" : "outline"} size="sm" className="h-9 text-xs"
                  onClick={() => { setErpStatus(s); setErpOffset(0); }}>{prettifyStatus(s)}</Button>
              ))}
            </div>
          </div>

          <ListState loading={erpQuery.isLoading} error={erpQuery.error} empty={erpItems.length === 0} emptyLabel="No ERP auctions yet" />
          {erpItems.length > 0 && (
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
                      <th className="px-4 py-3 w-10"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {erpItems.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/delivery-requests/${item.id}`} className="font-medium text-blue-600 hover:underline">{item.request_number}</Link>
                            <Badge variant="outline" className="ml-1.5 border-0 font-medium text-[10px] bg-blue-50 text-blue-700">
                              {item.source === "erp" ? "ERP" : "APP"}
                            </Badge>
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
                          <td className="px-4 py-3"><AuctionRowMenu auctionId={item.id} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div></Card>
              </div>
              <div className="sm:hidden space-y-2">
                {erpItems.map((item) => (
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
              <Pagination total={erpTotal} offset={erpOffset} onOffsetChange={setErpOffset} />
            </>
          )}
        </TabsContent>

        {/* App Tab */}
        <TabsContent value="app" className="mt-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input placeholder="Search request #, city..." value={appSearch}
                onChange={(e) => { setAppSearch(e.target.value); setAppOffset(0); setTimeout(() => setAppDebouncedSearch(e.target.value), 300); }}
                className="pl-9 h-9 text-sm" />
            </div>
            <div className="flex gap-1.5">
              <Button variant={!appStatus ? "default" : "outline"} size="sm" className="h-9 text-xs"
                onClick={() => { setAppStatus(""); setAppOffset(0); }}>All</Button>
              {AUCTION_PAGE_STATUSES.map((s) => (
                <Button key={s} variant={appStatus === s ? "default" : "outline"} size="sm" className="h-9 text-xs"
                  onClick={() => { setAppStatus(s); setAppOffset(0); }}>{prettifyStatus(s)}</Button>
              ))}
            </div>
          </div>

          <ListState loading={appQuery.isLoading} error={appQuery.error} empty={appItems.length === 0} emptyLabel="No app auctions found" />
          {appItems.length > 0 && (
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
                      <th className="px-4 py-3 w-10"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {appItems.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/delivery-requests/${item.id}`} className="font-medium text-blue-600 hover:underline">{item.request_number}</Link>
                            <Badge variant="outline" className="ml-1.5 border-0 font-medium text-[10px] bg-gray-100 text-gray-600">APP</Badge>
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
                          <td className="px-4 py-3"><AuctionRowMenu auctionId={item.id} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div></Card>
              </div>
              <div className="sm:hidden space-y-2">
                {appItems.map((item) => (
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
                          <span>{item.consigner_name}</span>
                          <span>·</span><span>{item.total_bids_count} bids</span>
                          {item.lowest_bid_amount && <><span>·</span><span>{formatCurrency(item.lowest_bid_amount)}</span></>}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
              <Pagination total={appTotal} offset={appOffset} onOffsetChange={setAppOffset} />
            </>
          )}
        </TabsContent>
      </Tabs>
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
