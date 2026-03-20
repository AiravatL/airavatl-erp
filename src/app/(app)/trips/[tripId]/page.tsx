"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAuctionTrip,
  listTripPaymentRequests,
  getTripPaymentSummary,
  listTripLoadingProofs,
  getDriverLocationForTrip,
} from "@/lib/api/trips";
import type { AuctionTripDetail } from "@/lib/api/trips";
import { queryKeys } from "@/lib/query/keys";
import { useAuth } from "@/lib/auth/auth-context";
import {
  VEHICLE_TYPE_LABELS,
  APP_TRIP_STATUS_LABELS,
} from "@/lib/types";
import type { AppTripStatus, VehicleTypeRequired } from "@/lib/types";
import { formatCurrency, formatDate, formatRelativeTime } from "@/lib/formatters";
import {
  ArrowLeft, Loader2, MapPin, Truck, Phone, User, Package,
  Route, DollarSign, Clock, ExternalLink, AlertTriangle,
  CircleDot, XCircle, Camera, Trash2,
} from "lucide-react";
import { TripTimeline } from "./_components/trip-timeline";
import { SignedImagePreview } from "@/components/shared/signed-image-preview";
import { AdminDeleteDialog } from "@/components/shared/admin-delete-dialog";
import dynamic from "next/dynamic";

const TripMap = dynamic(() => import("@/components/shared/trip-map").then((m) => ({ default: m.TripMap })), { ssr: false });

const STATUS_COLORS: Record<AppTripStatus, string> = {
  pending: "bg-gray-100 text-gray-700",
  waiting_driver_acceptance: "bg-amber-100 text-amber-800",
  driver_assigned: "bg-blue-100 text-blue-800",
  en_route_to_pickup: "bg-cyan-100 text-cyan-800",
  at_pickup: "bg-cyan-100 text-cyan-800",
  loading: "bg-indigo-100 text-indigo-800",
  in_transit: "bg-purple-100 text-purple-800",
  at_delivery: "bg-purple-100 text-purple-800",
  unloading: "bg-violet-100 text-violet-800",
  waiting_for_advance: "bg-amber-100 text-amber-700",
  waiting_for_final: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
  driver_rejected: "bg-red-100 text-red-800",
};

const OPS_ROLES = new Set(["operations"]);
const ACTIVE_TRACKING_STATUSES = new Set<AppTripStatus>([
  "driver_assigned", "en_route_to_pickup", "at_pickup", "loading",
  "in_transit", "at_delivery", "unloading",
]);

export default function TripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const isOps = user ? OPS_ROLES.has(user.role) : false;
  const isAdmin = user?.role === "super_admin" || user?.role === "admin";
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const tripQuery = useQuery({
    queryKey: queryKeys.trip(tripId),
    queryFn: () => getAuctionTrip(tripId),
  });

  const status = (tripQuery.data?.trip?.status as AppTripStatus) ?? null;
  const isActiveTrip = status != null && ACTIVE_TRACKING_STATUSES.has(status);

  const paymentSummaryQuery = useQuery({
    queryKey: queryKeys.tripPaymentSummary(tripId),
    queryFn: () => getTripPaymentSummary(tripId),
    enabled: !!tripQuery.data,
  });

  const loadingProofsQuery = useQuery({
    queryKey: queryKeys.tripLoadingProofs(tripId),
    queryFn: () => listTripLoadingProofs(tripId),
    enabled: !!tripQuery.data,
  });

  const isTerminal = status != null && ["completed", "cancelled", "driver_rejected"].includes(status);

  const driverLocationQuery = useQuery({
    queryKey: queryKeys.tripDriverLocation(tripId),
    queryFn: () => getDriverLocationForTrip(tripId),
    enabled: !!tripQuery.data && !isTerminal,
    refetchInterval: isActiveTrip ? 30_000 : false,
    staleTime: isActiveTrip ? 15_000 : 5 * 60_000,
  });

  const { loadingProofs, podProofs } = useMemo(() => {
    const all = loadingProofsQuery.data ?? [];
    return {
      loadingProofs: all.filter((p) => p.proofType === "loading"),
      podProofs: all.filter((p) => p.proofType === "pod"),
    };
  }, [loadingProofsQuery.data]);

  if (tripQuery.isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  }

  if (tripQuery.error || !tripQuery.data?.trip) {
    return (
      <div className="space-y-4">
        <Link href="/trips" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Back to Trips
        </Link>
        <Card><CardContent className="p-6"><p className="text-sm text-red-600">{tripQuery.error instanceof Error ? tripQuery.error.message : "Trip not found"}</p></CardContent></Card>
      </div>
    );
  }

  const data = tripQuery.data;
  const trip = data.trip;
  const bid = data.bid as Record<string, unknown> | null;
  const erpMeta = data.erp_metadata;
  const reqMeta = data.request_metadata;

  const statusLabel = APP_TRIP_STATUS_LABELS[status!] ?? (status as string);
  const statusColor = STATUS_COLORS[status!] ?? "bg-gray-100 text-gray-700";
  const vehicleLabel = VEHICLE_TYPE_LABELS[trip.vehicle_type as VehicleTypeRequired] ?? (trip.vehicle_type as string);

  // Financial: bid.bid_amount = what driver gets, trip.trip_amount = what consigner pays (app trips)
  const driverBidAmount = (bid?.bid_amount as number) ?? 0;
  const tripAmount = (trip.trip_amount as number) ?? 0; // consigner-facing amount (bid + commission + GST)
  const erpConsignerAmount = erpMeta?.consigner_trip_amount ?? null; // ERP trips: manually set consigner price
  const isErpTrip = !!reqMeta;

  // Revenue calculation
  const appRevenue = tripAmount > driverBidAmount ? tripAmount - driverBidAmount : 0;
  const erpMargin = erpConsignerAmount != null ? erpConsignerAmount - driverBidAmount : null;

  const driverName = (bid?.bidder_name as string) ?? "Unknown Driver";
  const driverPhone = (bid?.bidder_phone as string) ?? "";
  const driverType = (bid?.bidder_type as string) ?? "";
  const driverTypeLabel = driverType === "individual_driver" ? "Individual Driver" : driverType === "transporter" ? "Transporter" : driverType;

  return (
    <div className="space-y-4">
      {/* Back nav */}
      <Link href="/trips" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Trips
      </Link>

      {/* Hero Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">{trip.trip_number as string}</h1>
              <Badge variant="outline" className={`border-0 font-semibold text-xs px-2.5 py-0.5 ${statusColor}`}>
                {statusLabel}
              </Badge>
              {isErpTrip && <Badge variant="outline" className="border-0 text-[10px] bg-blue-50 text-blue-700 font-medium">ERP</Badge>}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Route className="h-3.5 w-3.5" />
              <span className="font-medium text-gray-700">{trip.pickup_city as string}</span>
              <span>→</span>
              <span className="font-medium text-gray-700">{trip.delivery_city as string}</span>
              {(trip.estimated_distance_km as number) > 0 && (
                <span className="text-gray-400">· {trip.estimated_distance_km as number} km</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {data.request_id && (
              <Link href={`/delivery-requests/${data.request_id}`}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                {data.request_number ?? "View Auction"} <ExternalLink className="h-3 w-3" />
              </Link>
            )}
            {isAdmin && (
              <Button variant="outline" size="sm" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 className="h-3 w-3 mr-1" /> Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Alert Banners */}
      {status === "driver_rejected" && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5">
          <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Driver Rejected This Trip</p>
            {(trip.driver_rejection_reason as string) && <p className="text-xs text-red-600 mt-0.5">{trip.driver_rejection_reason as string}</p>}
          </div>
        </div>
      )}
      {status === "cancelled" && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5">
          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Trip Cancelled</p>
            {(trip.cancelled_reason as string) && <p className="text-xs text-red-600 mt-0.5">{trip.cancelled_reason as string}</p>}
          </div>
        </div>
      )}

      {/* Map — Full Width */}
      {(trip.pickup_latitude as number) && (trip.delivery_latitude as number) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-500" />
              {isActiveTrip && driverLocationQuery.data?.location ? "Live Tracking" : "Trip Route"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TripMap
              driverLat={driverLocationQuery.data?.location?.latitude ?? null}
              driverLng={driverLocationQuery.data?.location?.longitude ?? null}
              driverHeading={driverLocationQuery.data?.location?.heading ?? null}
              pickupLat={trip.pickup_latitude as number}
              pickupLng={trip.pickup_longitude as number}
              deliveryLat={trip.delivery_latitude as number}
              deliveryLng={trip.delivery_longitude as number}
              isStale={driverLocationQuery.data?.isStale ?? false}
            />
            {driverLocationQuery.data?.location && (
              <div className="flex items-center justify-between mt-2">
                <p className="text-[11px] text-gray-400">
                  {driverLocationQuery.data.location.updatedAt ? formatRelativeTime(driverLocationQuery.data.location.updatedAt) : ""}
                  {driverLocationQuery.data.location.speedKmph != null && driverLocationQuery.data.location.speedKmph > 0 ? ` · ${Math.round(driverLocationQuery.data.location.speedKmph)} km/h` : ""}
                </p>
                <a href={`https://www.google.com/maps?q=${driverLocationQuery.data.location.latitude},${driverLocationQuery.data.location.longitude}`}
                  target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  Open in Maps <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            {driverLocationQuery.data?.isStale && (
              <p className="text-[11px] text-amber-600 mt-1">{driverLocationQuery.data.staleWarning ?? "Location data may be outdated"}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left Column — Route + Cargo + Timeline */}
        <div className="lg:col-span-2 space-y-4">

          {/* Route Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-500" /> Route Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Pickup */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
                  <div className="w-px h-8 bg-gray-200" />
                </div>
                <div className="flex-1 -mt-1">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Pickup</p>
                  <p className="text-sm text-gray-900 mt-0.5">{trip.pickup_formatted_address as string}</p>
                  {((trip.pickup_contact_name as string) || (trip.pickup_contact_phone as string)) && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      {(trip.pickup_contact_name as string) && <span className="flex items-center gap-1"><User className="h-3 w-3" />{trip.pickup_contact_name as string}</span>}
                      {(trip.pickup_contact_phone as string) && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{trip.pickup_contact_phone as string}</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Delivery */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="h-3 w-3 rounded-full bg-red-500 ring-2 ring-red-100" />
                </div>
                <div className="flex-1 -mt-1">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Delivery</p>
                  <p className="text-sm text-gray-900 mt-0.5">{trip.delivery_formatted_address as string}</p>
                  {((trip.delivery_contact_name as string) || (trip.delivery_contact_phone as string)) && (
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      {(trip.delivery_contact_name as string) && <span className="flex items-center gap-1"><User className="h-3 w-3" />{trip.delivery_contact_name as string}</span>}
                      {(trip.delivery_contact_phone as string) && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{trip.delivery_contact_phone as string}</span>}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cargo & Vehicle */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-500" /> Cargo & Vehicle
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <InfoBlock label="Vehicle" value={vehicleLabel} />
                <InfoBlock label="Schedule" value={formatDate(trip.consignment_date as string)} />
                {(trip.cargo_weight_kg as number) > 0 && <InfoBlock label="Weight" value={`${Number(trip.cargo_weight_kg).toLocaleString()} kg`} />}
                {(trip.estimated_distance_km as number) > 0 && <InfoBlock label="Distance" value={`${trip.estimated_distance_km} km`} />}
              </div>
              {((trip.cargo_description as string) || (trip.special_instructions as string)) && (
                <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                  {(trip.cargo_description as string) && (
                    <div><p className="text-[11px] text-gray-400 uppercase">Description</p><p className="text-sm text-gray-700">{trip.cargo_description as string}</p></div>
                  )}
                  {(trip.special_instructions as string) && (
                    <div><p className="text-[11px] text-gray-400 uppercase">Instructions</p><p className="text-sm text-gray-700">{trip.special_instructions as string}</p></div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <TripTimeline trip={trip} currentStatus={status!} isErp={isErpTrip} />
        </div>

        {/* Right Column — Driver + Financial + Metadata */}
        <div className="space-y-4">

          {/* Driver Card */}
          {bid && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Truck className="h-4 w-4 text-gray-500" /> Driver
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold text-sm">
                    {driverName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{driverName}</p>
                    {driverPhone && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3" />{driverPhone}
                      </p>
                    )}
                    <Badge variant="outline" className={`border-0 text-[10px] mt-0.5 ${driverType === "individual_driver" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
                      {driverTypeLabel}
                    </Badge>
                  </div>
                </div>
                {isActiveTrip && driverLocationQuery.data?.location && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <CircleDot className="h-3 w-3 text-emerald-500" />
                      <span>Live tracking active</span>
                      {driverLocationQuery.data.location.updatedAt && (
                        <><span className="text-gray-300">·</span><span>{formatRelativeTime(driverLocationQuery.data.location.updatedAt)}</span></>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* OTP Card (for pickup) */}
          {(status === "waiting_driver_acceptance" || status === "driver_assigned" || status === "en_route_to_pickup" || status === "at_pickup") && (trip.pickup_otp as string) && (
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-gray-400 uppercase mb-1">Pickup OTP</p>
                <p className="text-2xl font-mono font-bold text-gray-900 tracking-widest">{trip.pickup_otp as string}</p>
                <p className="text-[11px] text-gray-400 mt-1">Share with driver at pickup point</p>
              </CardContent>
            </Card>
          )}

          {/* Documents — Loading Proof & POD */}
          {(loadingProofs.length > 0 || podProofs.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Camera className="h-4 w-4 text-gray-500" /> Documents
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingProofs.length > 0 && (
                  <div>
                    <p className="text-[11px] text-gray-400 uppercase mb-1.5">Loading Proof ({loadingProofs.length})</p>
                    {loadingProofs.map((proof) => (
                      <div key={proof.id} className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50/50 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-xs text-gray-900 truncate">{proof.fileName}</p>
                          <p className="text-[11px] text-gray-400">{proof.uploadedByName} · {formatDate(proof.createdAt)}</p>
                        </div>
                        {proof.objectKey && <SignedImagePreview objectKey={proof.objectKey} label="Loading Proof" source="trip" />}
                      </div>
                    ))}
                  </div>
                )}
                {podProofs.length > 0 && (
                  <div>
                    <p className="text-[11px] text-gray-400 uppercase mb-1.5">POD — Proof of Delivery ({podProofs.length})</p>
                    {podProofs.map((proof) => (
                      <div key={proof.id} className="flex items-center justify-between rounded-md border border-gray-100 bg-gray-50/50 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-xs text-gray-900 truncate">{proof.fileName}</p>
                          <p className="text-[11px] text-gray-400">{proof.uploadedByName} · {formatDate(proof.createdAt)}</p>
                        </div>
                        {proof.objectKey && <SignedImagePreview objectKey={proof.objectKey} label="Proof of Delivery" source="trip" />}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {loadingProofs.length === 0 && podProofs.length === 0 && !loadingProofsQuery.isLoading && status && !["pending", "waiting_driver_acceptance", "driver_assigned", "en_route_to_pickup", "driver_rejected", "cancelled"].includes(status) && (
            <Card>
              <CardContent className="p-4 text-center">
                <Camera className="h-6 w-6 text-gray-300 mx-auto mb-1" />
                <p className="text-xs text-gray-400">No proofs uploaded yet</p>
              </CardContent>
            </Card>
          )}

          {/* Financial Card */}
          {!isOps && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-gray-500" /> Financials
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <FinRow label="Driver Bid" value={formatCurrency(driverBidAmount)} />

                {isErpTrip && erpConsignerAmount != null ? (
                  <>
                    <FinRow label="Consigner Pays" value={formatCurrency(erpConsignerAmount)} />
                    <div className="pt-2 border-t border-gray-100">
                      <FinRow label="Margin (Revenue)"
                        value={formatCurrency(erpMargin ?? 0)}
                        valueClass={erpMargin != null && erpMargin >= 0 ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold"} />
                    </div>
                  </>
                ) : (
                  <>
                    <FinRow label="Consigner Pays" value={formatCurrency(tripAmount)} />
                    <div className="pt-2 border-t border-gray-100">
                      <FinRow label="Platform Revenue"
                        value={formatCurrency(appRevenue)}
                        valueClass="text-emerald-700 font-semibold" />
                      <p className="text-[11px] text-gray-400 mt-1">Commission + GST (rates at time of booking)</p>
                    </div>
                  </>
                )}

                {!isErpTrip && paymentSummaryQuery.data && (
                  <div className="pt-2 border-t border-gray-100 space-y-1.5">
                    <p className="text-[11px] text-gray-400 uppercase">Consigner Payments (Collected)</p>
                    <FinRow label="Advance Collected" value={formatCurrency(paymentSummaryQuery.data.paidAdvanceTotal)} />
                    <FinRow label="Balance Collected" value={formatCurrency(paymentSummaryQuery.data.paidBalanceTotal)} />
                    <FinRow label="Total Collected" value={formatCurrency(paymentSummaryQuery.data.paidAdvanceTotal + paymentSummaryQuery.data.paidBalanceTotal)} valueClass="font-semibold" />
                    {paymentSummaryQuery.data.suggestedFinalAmount > 0 && (
                      <FinRow label="Remaining" value={formatCurrency(paymentSummaryQuery.data.suggestedFinalAmount)} valueClass="text-amber-700" />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ERP Metadata */}
          {reqMeta && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-500" /> ERP Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <InfoRow label="Created By" value={reqMeta.created_by_name} />
                {reqMeta.consigner_profile_name && <InfoRow label="Consigner" value={reqMeta.consigner_profile_name} />}
                {erpMeta?.selected_by_name && <InfoRow label="Winner Selected By" value={erpMeta.selected_by_name} />}
                {reqMeta.internal_notes && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-[11px] text-gray-400 uppercase">Notes</p>
                    <p className="text-sm text-gray-700 mt-0.5">{reqMeta.internal_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Dates */}
          <Card>
            <CardContent className="p-4 space-y-1.5">
              <InfoRow label="Created" value={formatDate(trip.created_at as string)} />
              <InfoRow label="Updated" value={formatRelativeTime(trip.updated_at as string)} />
              {(trip.delivery_completed_at as string) && <InfoRow label="Delivered" value={formatDate(trip.delivery_completed_at as string)} />}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Admin Delete Dialog */}
      <AdminDeleteDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onDeleted={() => {
          router.push("/trips");
        }}
        type="trip"
        id={tripId}
        label={trip.trip_number as string}
        description={`Status: ${statusLabel} · All payments, proofs, and ratings will be deleted`}
      />
    </div>
  );
}

/* ---------- Small Components ---------- */

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm text-gray-900 text-right">{value}</span>
    </div>
  );
}

function FinRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm text-right ${valueClass ?? "text-gray-900"}`}>{value}</span>
    </div>
  );
}

