"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { listDriverLocations } from "@/lib/api/app-reports";
import { queryKeys } from "@/lib/query/keys";
import { MapPin, Truck, Wifi, WifiOff, Loader2 } from "lucide-react";

const DriversMap = dynamic(
  () => import("@/components/shared/drivers-map").then((m) => ({ default: m.DriversMap })),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full min-h-[400px] bg-gray-50 rounded-lg"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div> },
);

export default function LiveMapPage() {
  const [onlineOnly, setOnlineOnly] = useState(false);

  const query = useQuery({
    queryKey: queryKeys.appDriverLocations({ onlineOnly }),
    queryFn: () => listDriverLocations({ onlineOnly }),
    refetchInterval: 30_000,
  });

  const drivers = query.data?.items ?? [];
  const online = drivers.filter((d) => d.isOnline).length;
  const onTrip = drivers.filter((d) => d.currentTripId).length;
  const withGps = drivers.filter((d) => d.isGpsEnabled).length;

  return (
    <div className="space-y-3 p-4 sm:p-6 h-[calc(100vh-64px)] flex flex-col">
      <PageHeader title="Live Fleet Map" description="Real-time driver locations across the platform" />

      {/* Stats + Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-4">
          <StatPill icon={<Truck className="h-3.5 w-3.5" />} label="On Map" value={drivers.length} />
          <StatPill icon={<Wifi className="h-3.5 w-3.5 text-emerald-600" />} label="Online" value={online} color="emerald" />
          <StatPill icon={<MapPin className="h-3.5 w-3.5 text-purple-600" />} label="On Trip" value={onTrip} color="purple" />
          <StatPill icon={<MapPin className="h-3.5 w-3.5 text-blue-600" />} label="GPS On" value={withGps} color="blue" />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="online-filter" checked={onlineOnly} onCheckedChange={setOnlineOnly} />
          <Label htmlFor="online-filter" className="text-sm text-gray-600">Online only</Label>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-blue-600 border-2 border-blue-200" /> Online
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-purple-600 border-2 border-purple-200" /> On Trip
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-gray-400 border-2 border-gray-200" /> Offline
        </span>
      </div>

      {/* Map */}
      <Card className="overflow-hidden flex-1 min-h-0">
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
            <DriversMap drivers={drivers} />
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {query.isError && (
        <Card><CardContent className="p-4 text-sm text-red-600">
          {query.error instanceof Error ? query.error.message : "Unable to load driver locations"}
        </CardContent></Card>
      )}
    </div>
  );
}

function StatPill({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      {icon}
      <span className="text-gray-500">{label}</span>
      <Badge variant="outline" className={`border-0 text-xs font-semibold ${
        color === "emerald" ? "bg-emerald-50 text-emerald-700" :
        color === "purple" ? "bg-purple-50 text-purple-700" :
        color === "blue" ? "bg-blue-50 text-blue-700" :
        "bg-gray-100 text-gray-700"
      }`}>
        {value}
      </Badge>
    </div>
  );
}
