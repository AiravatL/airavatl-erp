"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface TripMapProps {
  driverLat: number | null;
  driverLng: number | null;
  driverHeading?: number | null;
  pickupLat: number;
  pickupLng: number;
  deliveryLat: number;
  deliveryLng: number;
  isStale?: boolean;
  className?: string;
}

const PICKUP_ICON = L.divIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#10b981;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const DELIVERY_ICON = L.divIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#ef4444;border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function driverIcon(heading: number | null, isStale: boolean) {
  const color = isStale ? "#94a3b8" : "#2563eb";
  const rotate = heading ? `transform:rotate(${heading}deg)` : "";
  return L.divIcon({
    html: `<div style="width:32px;height:32px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;${rotate}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
    </div>`,
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

export function TripMap({
  driverLat,
  driverLng,
  driverHeading,
  pickupLat,
  pickupLng,
  deliveryLat,
  deliveryLng,
  isStale = false,
  className,
}: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const driverMarkerRef = useRef<L.Marker | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
    }).addTo(map);

    // Add zoom control to top-right
    L.control.zoom({ position: "topright" }).addTo(map);

    // Add pickup + delivery markers
    L.marker([pickupLat, pickupLng], { icon: PICKUP_ICON })
      .addTo(map)
      .bindTooltip("Pickup", { direction: "top", offset: [0, -8] });

    L.marker([deliveryLat, deliveryLng], { icon: DELIVERY_ICON })
      .addTo(map)
      .bindTooltip("Delivery", { direction: "top", offset: [0, -8] });

    // Draw route line between pickup and delivery
    L.polyline(
      [[pickupLat, pickupLng], [deliveryLat, deliveryLng]],
      { color: "#6366f1", weight: 3, opacity: 0.5, dashArray: "8 6" }
    ).addTo(map);

    // Fit bounds
    const bounds = L.latLngBounds([
      [pickupLat, pickupLng],
      [deliveryLat, deliveryLng],
    ]);
    if (driverLat && driverLng) {
      bounds.extend([driverLat, driverLng]);
    }
    map.fitBounds(bounds, { padding: [40, 40] });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update driver marker on location change
  useEffect(() => {
    if (!mapRef.current) return;

    if (driverLat && driverLng) {
      const icon = driverIcon(driverHeading ?? null, isStale);
      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng([driverLat, driverLng]);
        driverMarkerRef.current.setIcon(icon);
      } else {
        driverMarkerRef.current = L.marker([driverLat, driverLng], { icon })
          .addTo(mapRef.current)
          .bindTooltip("Driver", { direction: "top", offset: [0, -18] });
      }
    }
  }, [driverLat, driverLng, driverHeading, isStale]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        zIndex: 0,
        width: "100%",
        // Default height when no caller className overrides; h-full from
        // parent flexbox lets the map stretch to fill available space.
        minHeight: 260,
        borderRadius: 12,
        overflow: "hidden",
      }}
    />
  );
}
