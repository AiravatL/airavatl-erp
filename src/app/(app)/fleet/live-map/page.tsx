"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listDriverLocations } from "@/lib/api/app-reports";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";
import { WifiOff, Loader2, LocateFixed, Search, Gauge } from "lucide-react";

const DriversMap = dynamic(
  () => import("@/components/shared/drivers-map").then((m) => ({ default: m.DriversMap })),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full min-h-[400px] bg-gray-50 rounded-lg"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div> },
);

export default function LiveMapPage() {
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const hasAutoSelectedRef = useRef(false);

  const query = useQuery({
    queryKey: queryKeys.appDriverLocations({}),
    queryFn: () => listDriverLocations({}),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const drivers = query.data?.items ?? [];
  const searchTerm = search.trim().toLowerCase();
  const sortedDrivers = useMemo(
    () =>
      [...drivers].sort((a, b) => {
        const updatedDiff =
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        if (updatedDiff !== 0) return updatedDiff;
        return a.driverName.localeCompare(b.driverName);
      }),
    [drivers],
  );
  const filteredDrivers = useMemo(() => {
    if (!searchTerm) return sortedDrivers;
    return sortedDrivers.filter((driver) => {
      const haystack = [
        driver.driverName,
        driver.phone,
        driver.driverType,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchTerm);
    });
  }, [searchTerm, sortedDrivers]);
  const onlineCount = drivers.filter((d) => d.isOnline).length;
  const onTripCount = drivers.filter((d) => d.currentTripId).length;
  const selectedDriver =
    filteredDrivers.find((driver) => driver.driverId === selectedDriverId) ?? null;

  useEffect(() => {
    if (filteredDrivers.length === 0) {
      setSelectedDriverId(null);
      return;
    }
    if (!hasAutoSelectedRef.current && !selectedDriverId) {
      setSelectedDriverId(filteredDrivers[0].driverId);
      hasAutoSelectedRef.current = true;
      return;
    }
    if (selectedDriverId && !filteredDrivers.some((driver) => driver.driverId === selectedDriverId)) {
      setSelectedDriverId(filteredDrivers[0].driverId);
    }
  }, [filteredDrivers, selectedDriverId]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-driver-row='true']")) return;
      setSelectedDriverId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  return (
    <div className="p-4 sm:p-6 h-[calc(100vh-64px)] flex flex-col">
      <PageHeader title="Live Fleet Map" description="Real-time driver locations across the platform" />

      <div className="mt-3 grid flex-1 min-h-0 gap-4 lg:[grid-template-columns:minmax(0,1fr)_minmax(300px,340px)]">
        <Card className="overflow-hidden min-h-0">
          <CardContent className="p-0 h-full">
            {query.isLoading ? (
              <div className="flex items-center justify-center h-full min-h-[400px] bg-gray-50">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : drivers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] bg-gray-50">
                <WifiOff className="h-10 w-10 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">No driver locations available</p>
                <p className="text-xs text-gray-400 mt-1">Drivers will appear here when they go online in the app</p>
              </div>
            ) : (
              <DriversMap
                drivers={filteredDrivers}
                selectedDriverId={selectedDriver?.driverId ?? null}
                onSelectDriver={setSelectedDriverId}
              />
            )}
          </CardContent>
        </Card>

        <Card className="min-h-0 overflow-hidden">
          <CardContent className="flex h-full min-h-[400px] flex-col p-0">
            <div className="shrink-0 border-b border-gray-100 px-4 pb-3 pt-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold text-gray-900">Drivers</h2>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>
                    <span className="font-semibold text-gray-900">{onlineCount}</span> online
                  </span>
                  <span className="h-3 w-px bg-gray-200" />
                  <span>
                    <span className="font-semibold text-gray-900">{onTripCount}</span> on trip
                  </span>
                </div>
              </div>

              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, phone, or type"
                  className="h-9 border-gray-200 pl-9 text-sm"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredDrivers.map((driver) => {
                const isSelected = selectedDriverId === driver.driverId;
                const status: "on_trip" | "online" | "offline" = driver.currentTripId
                  ? "on_trip"
                  : driver.isOnline
                    ? "online"
                    : "offline";
                return (
                  <button
                    key={driver.driverId}
                    type="button"
                    data-driver-row="true"
                    onClick={() => setSelectedDriverId(driver.driverId)}
                    className={cn(
                      "group relative flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors",
                      isSelected ? "bg-violet-50/70" : "hover:bg-gray-50",
                    )}
                  >
                    {isSelected ? (
                      <span className="absolute inset-y-0 left-0 w-1 rounded-r bg-violet-500" />
                    ) : null}
                    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                      {driver.driverName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                      <span
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white",
                          status === "on_trip" && "bg-violet-500",
                          status === "online" && "bg-emerald-500",
                          status === "offline" && "bg-gray-400",
                        )}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {driver.driverName}
                        </p>
                        {isSelected ? (
                          <LocateFixed className="h-3.5 w-3.5 shrink-0 text-violet-600" />
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
                        <span className="truncate">{prettify(driver.driverType)}</span>
                        <span className="text-gray-300">·</span>
                        <span
                          className={cn(
                            "font-medium",
                            status === "on_trip" && "text-violet-600",
                            status === "online" && "text-emerald-600",
                            status === "offline" && "text-gray-400",
                          )}
                        >
                          {status === "on_trip" ? "On trip" : status === "online" ? "Online" : "Offline"}
                        </span>
                        {!driver.isGpsEnabled ? (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="font-medium text-amber-600">GPS off</span>
                          </>
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                        <span>{timeSince(driver.updatedAt)}</span>
                        {driver.speedKmph != null && driver.speedKmph > 0 ? (
                          <span className="flex items-center gap-0.5">
                            <Gauge className="h-3 w-3" />
                            {Math.round(driver.speedKmph)} km/h
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
              {filteredDrivers.length === 0 ? (
                <div className="flex h-full min-h-40 items-center justify-center px-4 text-center text-sm text-gray-500">
                  No drivers match your search.
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error */}
      {query.isError && (
        <Card><CardContent className="p-4 text-sm text-red-600">
          {query.error instanceof Error ? query.error.message : "Unable to load driver locations"}
        </CardContent></Card>
      )}
    </div>
  );
}

function prettify(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function timeSince(dateStr: string) {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

