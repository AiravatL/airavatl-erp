"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import type { DriverLocationItem } from "@/lib/api/app-reports";

interface DriversMapProps {
  drivers: DriverLocationItem[];
  className?: string;
}

function driverMarkerIcon(isOnline: boolean, hasTrip: boolean) {
  const bg = hasTrip ? "#7c3aed" : isOnline ? "#2563eb" : "#94a3b8";
  const ring = hasTrip ? "#c4b5fd" : isOnline ? "#93c5fd" : "#cbd5e1";
  return L.divIcon({
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${bg};border:3px solid ${ring};box-shadow:0 2px 6px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H20a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
    </div>`,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function formatPhone(phone: string) {
  if (!phone) return "";
  const d = phone.replace(/^91/, "");
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  return phone;
}

function prettify(s: string) {
  return s.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function timeSince(dateStr: string) {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60000) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function DriversMap({ drivers, className }: DriversMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [22.5, 78.5], // Center of India
      zoom: 5,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
    }).addTo(map);

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (clusterObj: L.MarkerCluster) => {
        const count = clusterObj.getChildCount();
        const size = count < 10 ? "small" : count < 50 ? "medium" : "large";
        const dim = size === "small" ? 36 : size === "medium" ? 44 : 52;
        const bg = size === "small" ? "#3b82f6" : size === "medium" ? "#2563eb" : "#1d4ed8";
        return L.divIcon({
          html: `<div style="width:${dim}px;height:${dim}px;border-radius:50%;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${size === "large" ? 16 : 13}px;box-shadow:0 2px 8px rgba(0,0,0,.3);border:3px solid rgba(255,255,255,.8)">${count}</div>`,
          className: "",
          iconSize: [dim, dim],
          iconAnchor: [dim / 2, dim / 2],
        });
      },
    });

    map.addLayer(cluster);
    clusterRef.current = cluster;
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []);

  // Update markers when drivers change
  useEffect(() => {
    if (!clusterRef.current) return;

    clusterRef.current.clearLayers();

    const markers: L.Marker[] = [];

    for (const d of drivers) {
      if (!d.latitude || !d.longitude) continue;

      const icon = driverMarkerIcon(d.isOnline, !!d.currentTripId);

      const statusParts: string[] = [];
      if (d.isOnline) statusParts.push('<span style="color:#16a34a">Online</span>');
      else statusParts.push('<span style="color:#94a3b8">Offline</span>');
      if (d.acceptingAuction) statusParts.push("Auction");
      if (d.acceptingInstant) statusParts.push("Instant");

      const popup = `
        <div style="min-width:180px;font-family:system-ui,sans-serif">
          <div style="font-weight:600;font-size:14px;color:#111827;margin-bottom:2px">${d.driverName}</div>
          <div style="font-size:12px;color:#6b7280;margin-bottom:6px">${formatPhone(d.phone)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
            <span style="font-size:11px;padding:1px 6px;border-radius:4px;background:${d.driverType === "individual_driver" ? "#eff6ff;color:#2563eb" : "#f5f3ff;color:#7c3aed"}">${prettify(d.driverType)}</span>
            ${statusParts.map((s) => `<span style="font-size:11px">${s}</span>`).join(" · ")}
          </div>
          ${d.currentTripId ? `<div style="font-size:11px;color:#7c3aed;margin-bottom:4px">On active trip</div>` : ""}
          ${d.batteryLevel != null ? `<div style="font-size:11px;color:#6b7280">Battery: ${Math.round(d.batteryLevel * 100)}%${d.isGpsEnabled ? "" : " · GPS off"}</div>` : ""}
          <div style="font-size:11px;color:#9ca3af;margin-top:4px">${timeSince(d.updatedAt)}</div>
        </div>
      `;

      const tooltipContent = d.driverName
        ? `<b>${d.driverName}</b>${d.phone ? `<br/>${formatPhone(d.phone)}` : ""}`
        : "Driver";

      const marker = L.marker([d.latitude, d.longitude], { icon })
        .bindPopup(popup, { closeButton: false, maxWidth: 240 })
        .bindTooltip(tooltipContent, {
          direction: "top",
          offset: [0, -18],
          permanent: false,
          opacity: 0.95,
          className: "driver-tooltip",
        });

      markers.push(marker);
    }

    clusterRef.current.addLayers(markers);

    // Fit bounds if we have markers
    if (markers.length > 0 && mapRef.current) {
      const bounds = L.latLngBounds(markers.map((m) => m.getLatLng()));
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [drivers]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height: "100%", width: "100%", minHeight: 400 }}
    />
  );
}
