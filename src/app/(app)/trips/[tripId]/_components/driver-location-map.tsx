"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { DriverLocationResponse } from "@/lib/api/trips";
import type { AppTripStatus } from "@/lib/types";
import { formatRelativeTime } from "@/lib/formatters";
import { MapPin, AlertTriangle, Navigation } from "lucide-react";

interface DriverLocationMapProps {
  tripId: string;
  driverLocation: DriverLocationResponse | null;
  pickupLat: number | null;
  pickupLng: number | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  tripStatus: AppTripStatus;
}

const TRACKING_STATUSES = new Set<AppTripStatus>([
  "driver_assigned",
  "en_route_to_pickup",
  "at_pickup",
  "loading",
  "in_transit",
  "at_delivery",
  "unloading",
]);

export function DriverLocationMap({
  tripId,
  driverLocation,
  pickupLat,
  pickupLng,
  deliveryLat,
  deliveryLng,
  tripStatus,
}: DriverLocationMapProps) {
  if (!TRACKING_STATUSES.has(tripStatus)) return null;

  const hasCoords = pickupLat != null && pickupLng != null && deliveryLat != null && deliveryLng != null;
  const hasDriverLocation = driverLocation?.location != null;

  if (!hasCoords) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-gray-500">
            <MapPin className="h-4 w-4" />
            <p className="text-sm">Map unavailable — coordinates missing</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const mapParams = new URLSearchParams({
    pickupLat: String(pickupLat),
    pickupLng: String(pickupLng),
    deliveryLat: String(deliveryLat),
    deliveryLng: String(deliveryLng),
  });

  if (hasDriverLocation) {
    mapParams.set("driverLat", String(driverLocation.location!.latitude));
    mapParams.set("driverLng", String(driverLocation.location!.longitude));
  }

  const mapUrl = `/api/trips/${encodeURIComponent(tripId)}/static-map?${mapParams.toString()}`;

  return (
    <Card>
      <CardContent className="p-0 overflow-hidden">
        {/* Stale warning */}
        {driverLocation?.isStale && driverLocation.staleWarning && (
          <div className="flex items-center gap-2 bg-amber-50 px-4 py-2 border-b border-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700">{driverLocation.staleWarning}</p>
          </div>
        )}

        {/* Map image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mapUrl}
          alt="Trip map"
          className="w-full h-auto min-h-[200px] bg-gray-100"
        />

        {/* ETA + info bar */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100">
          <div className="flex items-center gap-3">
            {driverLocation?.etaMinutes != null && (
              <div className="flex items-center gap-1.5">
                <Navigation className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-sm font-medium text-blue-700">
                  ETA: {driverLocation.etaMinutes < 60
                    ? `${driverLocation.etaMinutes}m`
                    : `${Math.floor(driverLocation.etaMinutes / 60)}h ${driverLocation.etaMinutes % 60}m`}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {hasDriverLocation && driverLocation.location!.updatedAt && (
              <span>Updated {formatRelativeTime(driverLocation.location!.updatedAt)}</span>
            )}
            {!hasDriverLocation && (
              <span className="text-gray-400">Driver location unavailable</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
