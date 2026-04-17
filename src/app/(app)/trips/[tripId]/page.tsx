"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { apiRequest } from "@/lib/api/http";
import { reviewTripProof } from "@/lib/api/trips";
import {
  ArrowLeft, Loader2, MapPin, Truck, Phone, User, Package,
  Route, DollarSign, Clock, ExternalLink, AlertTriangle,
  CircleDot, XCircle, Camera, Trash2, Banknote, Check, X,
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
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [rejectProofId, setRejectProofId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const isOps = user ? OPS_ROLES.has(user.role) : false;
  const isAdmin = user?.role === "super_admin" || user?.role === "admin";
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const tripQuery = useQuery({
    queryKey: queryKeys.trip(tripId),
    queryFn: () => getAuctionTrip(tripId),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const status = (tripQuery.data?.trip?.status as AppTripStatus) ?? null;
  const isActiveTrip = status != null && ACTIVE_TRACKING_STATUSES.has(status);

  const paymentSummaryQuery = useQuery({
    queryKey: queryKeys.tripPaymentSummary(tripId),
    queryFn: () => getTripPaymentSummary(tripId),
    enabled: !!tripQuery.data,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

  const loadingProofsQuery = useQuery({
    queryKey: queryKeys.tripLoadingProofs(tripId),
    queryFn: () => listTripLoadingProofs(tripId),
    enabled: !!tripQuery.data,
    staleTime: 60_000,
  });

  const isTerminal = status != null && ["completed", "cancelled", "driver_rejected"].includes(status);
  const isErp = !!tripQuery.data?.request_metadata;
  const canRequestPayment = (isOps || isAdmin) && isErp;

  const paymentRequestsQuery = useQuery({
    queryKey: queryKeys.tripPaymentRequests(tripId),
    queryFn: () => listTripPaymentRequests(tripId),
    enabled: !!tripQuery.data && canRequestPayment,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const paymentRequests = paymentRequestsQuery.data ?? [];
  const hasAdvanceRequest = paymentRequests.some((p) => p.type === "advance");
  const hasFinalRequest = paymentRequests.some((p) => p.type === "final");

  const needsAdvanceRequest =
    canRequestPayment && status === "waiting_for_advance" && !hasAdvanceRequest;
  const needsFinalRequest =
    canRequestPayment && status === "waiting_for_final" && !hasFinalRequest;
  const advanceAlreadyRequested =
    canRequestPayment && status === "waiting_for_advance" && hasAdvanceRequest;
  const finalAlreadyRequested =
    canRequestPayment && status === "waiting_for_final" && hasFinalRequest;

  const proofReviewMutation = useMutation({
    mutationFn: (input: { proofId: string; action: "accept" | "reject"; rejectionReason?: string }) =>
      reviewTripProof(tripId, input),
    onSuccess: () => {
      setRejectProofId(null);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: queryKeys.tripLoadingProofs(tripId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
    },
  });

  const requestPaymentMutation = useMutation({
    mutationFn: (paymentType: "advance" | "final") =>
      apiRequest(`/api/trips/${tripId}/request-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_type: paymentType }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trip(tripId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tripPaymentSummary(tripId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tripPaymentRequests(tripId) });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
  });

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
  const assignedDriver = data.assigned_driver;
  const erpMeta = data.erp_metadata;
  const reqMeta = data.request_metadata;

  const statusLabel = APP_TRIP_STATUS_LABELS[status!] ?? (status as string);
  const statusColor = STATUS_COLORS[status!] ?? "bg-gray-100 text-gray-700";
  const vehicleLabel = VEHICLE_TYPE_LABELS[trip.vehicle_type as VehicleTypeRequired] ?? (trip.vehicle_type as string);

  // Financial: trip_amount = what consigner pays (both app and ERP)
  // driver_bid_amount = what driver gets (= auction bid)
  const driverBidAmount = (bid?.bid_amount as number) ?? (trip.driver_bid_amount as number) ?? 0;
  const tripAmount = (trip.trip_amount as number) ?? 0;
  const isErpTrip = !!reqMeta;

  // Revenue = consigner pays - driver gets (works for both app and ERP)
  const revenue = tripAmount > driverBidAmount ? tripAmount - driverBidAmount : 0;

  const driverName = (bid?.bidder_name as string) ?? "Unknown Driver";
  const driverPhone = (bid?.bidder_phone as string) ?? "";
  const driverType = (bid?.bidder_type as string) ?? "";
  const driverTypeLabel = driverType === "individual_driver" ? "Individual Driver" : driverType === "transporter" ? "Transporter" : driverType;
  const bidderCardTitle =
    driverType === "transporter" ? "Transporter (Contract Holder)" : "Driver";

  return (
    <div className="space-y-3">
      {/* Back nav + hero combined into one tight row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Link href="/trips" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-lg font-bold text-gray-900 tracking-tight">{trip.trip_number as string}</h1>
          <Badge variant="outline" className={`border-0 font-semibold text-[11px] px-2 py-0 h-5 ${statusColor}`}>
            {statusLabel}
          </Badge>
          {isErpTrip && <Badge variant="outline" className="border-0 text-[10px] bg-blue-50 text-blue-700 font-medium h-5">ERP</Badge>}
          <span className="text-gray-300 ml-1">·</span>
          <span className="inline-flex items-center gap-1 text-xs text-gray-600">
            <Route className="h-3 w-3 text-gray-400" />
            <span className="font-medium">{trip.pickup_city as string}</span>
            <span className="text-gray-400">→</span>
            <span className="font-medium">{trip.delivery_city as string}</span>
            {(trip.estimated_distance_km as number) > 0 && (
              <span className="text-gray-400">· {trip.estimated_distance_km as number} km</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <Button variant="outline" size="sm" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
          )}
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

      {/* Above-the-fold grid: map (6/12) + contacts (3/12) + documents (3/12) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">

        {/* ─── Map (fills its card) ─── */}
        {(trip.pickup_latitude as number) && (trip.delivery_latitude as number) && (
          <Card className="lg:col-span-6 flex flex-col">
            <CardContent className="p-3 flex flex-col flex-1 gap-2">
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                  <MapPin className="h-3.5 w-3.5 text-gray-500" />
                  {isActiveTrip && driverLocationQuery.data?.location ? "Live Tracking" : "Trip Route"}
                </div>
                {driverLocationQuery.data?.location && (
                  <a
                    href={`https://www.google.com/maps?q=${driverLocationQuery.data.location.latitude},${driverLocationQuery.data.location.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5"
                  >
                    Open in Maps <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <TripMap
                className="flex-1 min-h-[320px] h-full"
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
                <p className="text-[11px] text-gray-400 shrink-0">
                  {driverLocationQuery.data.location.updatedAt ? formatRelativeTime(driverLocationQuery.data.location.updatedAt) : ""}
                  {driverLocationQuery.data.location.speedKmph != null && driverLocationQuery.data.location.speedKmph > 0 ? ` · ${Math.round(driverLocationQuery.data.location.speedKmph)} km/h` : ""}
                  {driverLocationQuery.data.isStale ? (
                    <span className="text-amber-600 ml-1">· {driverLocationQuery.data.staleWarning ?? "Location may be outdated"}</span>
                  ) : null}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── Contacts column ─── */}
        <div className="lg:col-span-3 space-y-3">
          {/* Driver on Road (employee driver assigned to a transporter trip) */}
          {assignedDriver && (
            <Card className="border-blue-200 bg-blue-50/30">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-xs font-semibold text-gray-700">Driver on Road</span>
                  <Badge variant="outline" className="ml-auto border-0 bg-blue-100 text-[9px] font-semibold text-blue-700 h-4 px-1.5">
                    Employee
                  </Badge>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs">
                    {assignedDriver.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{assignedDriver.name}</p>
                    {assignedDriver.phone && (
                      <a
                        href={`tel:${assignedDriver.phone}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                      >
                        <Phone className="h-3 w-3" />{assignedDriver.phone}
                      </a>
                    )}
                    {assignedDriver.license_number && (
                      <p className="text-[11px] text-gray-500">DL {assignedDriver.license_number}</p>
                    )}
                  </div>
                </div>
                {isActiveTrip && driverLocationQuery.data?.location && (
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-2 pt-2 border-t border-blue-100">
                    <CircleDot className="h-3 w-3 text-emerald-500" />
                    Live tracking
                    {driverLocationQuery.data.location.updatedAt && (
                      <span className="text-gray-400">· {formatRelativeTime(driverLocationQuery.data.location.updatedAt)}</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Bidder / Contract Holder */}
          {bid && (
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Truck className="h-3.5 w-3.5 text-gray-500" />
                  <span className="text-xs font-semibold text-gray-700">{bidderCardTitle}</span>
                  <Badge variant="outline" className={`ml-auto border-0 text-[9px] font-semibold h-4 px-1.5 ${driverType === "individual_driver" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
                    {driverTypeLabel}
                  </Badge>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold text-xs">
                    {driverName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{driverName}</p>
                    {driverPhone && (
                      <a
                        href={`tel:${driverPhone}`}
                        className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600 hover:underline"
                      >
                        <Phone className="h-3 w-3" />{driverPhone}
                      </a>
                    )}
                  </div>
                </div>
                {!assignedDriver && isActiveTrip && driverLocationQuery.data?.location && (
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-2 pt-2 border-t border-gray-100">
                    <CircleDot className="h-3 w-3 text-emerald-500" />
                    Live tracking
                    {driverLocationQuery.data.location.updatedAt && (
                      <span className="text-gray-400">· {formatRelativeTime(driverLocationQuery.data.location.updatedAt)}</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* OTP + Financial summary stacked */}
          {(status === "waiting_driver_acceptance" || status === "driver_assigned" || status === "en_route_to_pickup" || status === "at_pickup") && (trip.pickup_otp as string) && (
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">Pickup OTP</span>
                  <span className="text-[10px] text-gray-400">Share at pickup</span>
                </div>
                <p className="text-xl font-mono font-bold text-gray-900 tracking-widest mt-0.5">{trip.pickup_otp as string}</p>
              </CardContent>
            </Card>
          )}

          {!isOps && (
            <Card>
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign className="h-3.5 w-3.5 text-gray-500" />
                  <span className="text-xs font-semibold text-gray-700">Financials</span>
                </div>
                <FinRow label="Driver Bid" value={formatCurrency(driverBidAmount)} />
                <FinRow label="Consigner" value={formatCurrency(tripAmount)} />
                <div className="pt-1.5 border-t border-gray-100">
                  <FinRow
                    label={isErpTrip ? "Margin" : "Revenue"}
                    value={formatCurrency(revenue)}
                    valueClass={revenue >= 0 ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold"}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payment Request CTA — only when no existing request of this type */}
          {(needsAdvanceRequest || needsFinalRequest) && (
            <Card className="border-amber-200 bg-amber-50/60">
              <CardContent className="p-3">
                <div className="flex items-start gap-2 mb-2">
                  <Banknote className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-gray-700">
                    {needsAdvanceRequest ? "Loading proof uploaded — request advance." : "POD uploaded — request final."}
                  </p>
                </div>
                {requestPaymentMutation.isError && (
                  <p className="text-[11px] text-red-600 mb-1">
                    {requestPaymentMutation.error instanceof Error ? requestPaymentMutation.error.message : "Failed"}
                  </p>
                )}
                <Button
                  size="sm"
                  className="h-7 text-[11px] gap-1 w-full"
                  disabled={requestPaymentMutation.isPending}
                  onClick={() => requestPaymentMutation.mutate(needsAdvanceRequest ? "advance" : "final")}
                >
                  {requestPaymentMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Banknote className="h-3 w-3" />
                  )}
                  {needsAdvanceRequest ? "Request Advance" : "Request Final"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Already-requested info — replaces the CTA once a request exists */}
          {(advanceAlreadyRequested || finalAlreadyRequested) && (() => {
            const req = paymentRequests.find(
              (p) => p.type === (advanceAlreadyRequested ? "advance" : "final"),
            );
            if (!req) return null;
            return (
              <Card className="border-emerald-200 bg-emerald-50/60">
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <Banknote className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-emerald-700">
                        {advanceAlreadyRequested ? "Advance Requested" : "Final Requested"}
                      </p>
                      <p className="text-[11px] text-gray-600 mt-0.5">
                        {formatCurrency(req.amount)} · {req.status}
                      </p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {req.requestedByName ? `by ${req.requestedByName} · ` : ""}
                        {formatRelativeTime(req.createdAt)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>

        {/* ─── Documents column + stacked Route + Cargo below (use the free space under Documents) ─── */}
        <div className="lg:col-span-3 space-y-3">
          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-xs font-semibold text-gray-700">Documents</span>
              </div>
              {loadingProofs.length === 0 && podProofs.length === 0 ? (
                <div className="py-3 text-center">
                  <Camera className="h-5 w-5 text-gray-300 mx-auto mb-1" />
                  <p className="text-[11px] text-gray-400">No proofs uploaded yet</p>
                </div>
              ) : (
                <>
                  {loadingProofs.length > 0 && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase mb-1">Loading Proof ({loadingProofs.length})</p>
                      {loadingProofs.map((proof) => (
                        <ProofCard
                          key={proof.id}
                          proof={proof}
                          label="Loading Proof"
                          isErp={isErpTrip}
                          canReview={(isOps || isAdmin) && isErpTrip}
                          onAccept={() => proofReviewMutation.mutate({ proofId: proof.id, action: "accept" })}
                          onReject={() => { setRejectProofId(proof.id); setRejectReason(""); proofReviewMutation.reset(); }}
                          isPending={proofReviewMutation.isPending}
                        />
                      ))}
                    </div>
                  )}
                  {podProofs.length > 0 && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase mb-1">POD ({podProofs.length})</p>
                      {podProofs.map((proof) => (
                        <ProofCard
                          key={proof.id}
                          proof={proof}
                          label="Proof of Delivery"
                          isErp={isErpTrip}
                          canReview={(isOps || isAdmin) && isErpTrip}
                          onAccept={() => proofReviewMutation.mutate({ proofId: proof.id, action: "accept" })}
                          onReject={() => { setRejectProofId(proof.id); setRejectReason(""); proofReviewMutation.reset(); }}
                          isPending={proofReviewMutation.isPending}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Route — stacked under Documents */}
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <MapPin className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-xs font-semibold text-gray-700">Route</span>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="flex flex-col items-center mt-1">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
                  <div className="w-px h-8 bg-gray-200 my-0.5" />
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-red-100" />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase">Pickup</p>
                    <p className="text-xs text-gray-900 leading-snug">{trip.pickup_formatted_address as string}</p>
                    {((trip.pickup_contact_name as string) || (trip.pickup_contact_phone as string)) && (
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {(trip.pickup_contact_name as string) || "—"}
                        {(trip.pickup_contact_phone as string) ? ` · ${trip.pickup_contact_phone as string}` : ""}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase">Delivery</p>
                    <p className="text-xs text-gray-900 leading-snug">{trip.delivery_formatted_address as string}</p>
                    {((trip.delivery_contact_name as string) || (trip.delivery_contact_phone as string)) && (
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {(trip.delivery_contact_name as string) || "—"}
                        {(trip.delivery_contact_phone as string) ? ` · ${trip.delivery_contact_phone as string}` : ""}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cargo & Vehicle — stacked under Route */}
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Package className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-xs font-semibold text-gray-700">Cargo & Vehicle</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ChipBlock label="Vehicle" value={vehicleLabel} />
                <ChipBlock label="Schedule" value={formatDate(trip.consignment_date as string)} />
                {(trip.cargo_weight_kg as number) > 0 && (
                  <ChipBlock label="Weight" value={`${Number(trip.cargo_weight_kg).toLocaleString()} kg`} />
                )}
                {(trip.estimated_distance_km as number) > 0 && (
                  <ChipBlock label="Distance" value={`${trip.estimated_distance_km} km`} />
                )}
              </div>
              {(trip.cargo_description as string) && (
                <p className="mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-600">
                  <span className="text-gray-400">Description · </span>{trip.cargo_description as string}
                </p>
              )}
              {(trip.special_instructions as string) && (
                <p className="mt-1 text-[11px] text-gray-600">
                  <span className="text-gray-400">Instructions · </span>{trip.special_instructions as string}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── Row 3: Timeline + ERP metadata side-by-side ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
        <div className="lg:col-span-2">
          <TripTimeline trip={trip} currentStatus={status!} isErp={isErpTrip} />
        </div>

        <div className="space-y-3">
          {reqMeta && (
            <Card>
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Clock className="h-3.5 w-3.5 text-gray-500" />
                  <span className="text-xs font-semibold text-gray-700">ERP Info</span>
                </div>
                <InfoRow label="Created By" value={reqMeta.created_by_name} />
                {reqMeta.consigner_profile_name && <InfoRow label="Consigner" value={reqMeta.consigner_profile_name} />}
                {erpMeta?.selected_by_name && <InfoRow label="Winner By" value={erpMeta.selected_by_name} />}
                {reqMeta.internal_notes && (
                  <p className="pt-1.5 border-t border-gray-100 text-[11px] text-gray-600">
                    <span className="text-gray-400">Notes · </span>{reqMeta.internal_notes}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {!isErpTrip && paymentSummaryQuery.data && (
            <Card>
              <CardContent className="p-3 space-y-1.5">
                <span className="text-xs font-semibold text-gray-700">Consigner Payments</span>
                <FinRow label="Advance Collected" value={formatCurrency(paymentSummaryQuery.data.paidAdvanceTotal)} />
                <FinRow label="Balance Collected" value={formatCurrency(paymentSummaryQuery.data.paidBalanceTotal)} />
                <FinRow label="Total" value={formatCurrency(paymentSummaryQuery.data.paidAdvanceTotal + paymentSummaryQuery.data.paidBalanceTotal)} valueClass="font-semibold" />
                {paymentSummaryQuery.data.suggestedFinalAmount > 0 && (
                  <FinRow label="Remaining" value={formatCurrency(paymentSummaryQuery.data.suggestedFinalAmount)} valueClass="text-amber-700" />
                )}
              </CardContent>
            </Card>
          )}

          {/* Tight dates strip */}
          <div className="rounded-lg border border-gray-200 bg-white p-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <span>
              <span className="text-gray-500">Created </span>
              <span className="text-gray-900">{formatDate(trip.created_at as string)}</span>
            </span>
            <span>
              <span className="text-gray-500">Updated </span>
              <span className="text-gray-900">{formatRelativeTime(trip.updated_at as string)}</span>
            </span>
            {(trip.delivery_completed_at as string) && (
              <span>
                <span className="text-gray-500">Delivered </span>
                <span className="text-gray-900">{formatDate(trip.delivery_completed_at as string)}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Admin Delete Dialog */}
      {/* Reject Proof Dialog */}
      <Dialog open={!!rejectProofId} onOpenChange={(o) => { if (!o) setRejectProofId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-base">Reject Proof</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Reason for rejection *</Label>
              <Input className="h-8 text-sm" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Image is blurry, wrong document, etc." maxLength={300} />
            </div>
            {proofReviewMutation.isError && <p className="text-sm text-red-600">{proofReviewMutation.error instanceof Error ? proofReviewMutation.error.message : "Failed"}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setRejectProofId(null)}>Cancel</Button>
            <Button size="sm" variant="destructive" className="h-8 text-xs" disabled={!rejectReason.trim() || proofReviewMutation.isPending}
              onClick={() => rejectProofId && proofReviewMutation.mutate({ proofId: rejectProofId, action: "reject", rejectionReason: rejectReason.trim() })}>
              {proofReviewMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <X className="h-3.5 w-3.5 mr-1" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

function ChipBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-50 px-2 py-1.5">
      <p className="text-[10px] text-gray-400 uppercase">{label}</p>
      <p className="text-xs font-medium text-gray-900 truncate">{value}</p>
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

function ProofCard({ proof, label, isErp, canReview, onAccept, onReject, isPending }: {
  proof: { id: string; fileName: string; objectKey: string; uploadedByName: string; createdAt: string;
    reviewStatus: string; reviewedByName: string | null; reviewedAt: string | null; rejectionReason: string | null };
  label: string; isErp: boolean; canReview: boolean;
  onAccept: () => void; onReject: () => void; isPending: boolean;
}) {
  const isRejected = proof.reviewStatus === "rejected";
  const isAccepted = proof.reviewStatus === "accepted";
  const isPendingReview = proof.reviewStatus === "pending";

  return (
    <div className={`rounded-md border px-3 py-2 mb-1.5 ${isRejected ? "border-red-200 bg-red-50/50" : isAccepted ? "border-emerald-200 bg-emerald-50/50" : "border-gray-100 bg-gray-50/50"}`}>
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-xs text-gray-900 truncate">{proof.fileName}</p>
            {isAccepted && <Badge variant="outline" className="border-0 text-[9px] bg-emerald-100 text-emerald-700 shrink-0">Accepted</Badge>}
            {isRejected && <Badge variant="outline" className="border-0 text-[9px] bg-red-100 text-red-700 shrink-0">Rejected</Badge>}
            {isPendingReview && isErp && <Badge variant="outline" className="border-0 text-[9px] bg-amber-100 text-amber-700 shrink-0">Pending Review</Badge>}
          </div>
          <p className="text-[11px] text-gray-400">{proof.uploadedByName} · {formatDate(proof.createdAt)}</p>
          {isRejected && proof.rejectionReason && (
            <p className="text-[11px] text-red-600 mt-0.5">Reason: {proof.rejectionReason}</p>
          )}
          {(isAccepted || isRejected) && proof.reviewedByName && (
            <p className="text-[10px] text-gray-400">Reviewed by {proof.reviewedByName}{proof.reviewedAt ? ` · ${formatDate(proof.reviewedAt)}` : ""}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {proof.objectKey && <SignedImagePreview objectKey={proof.objectKey} label={label} source="trip" />}
          {canReview && isPendingReview && (
            <>
              <Button size="sm" variant="outline" className="h-6 text-[10px] gap-0.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                disabled={isPending} onClick={onAccept}>
                <Check className="h-3 w-3" /> Accept
              </Button>
              <Button size="sm" variant="outline" className="h-6 text-[10px] gap-0.5 text-red-700 border-red-200 hover:bg-red-50"
                disabled={isPending} onClick={onReject}>
                <X className="h-3 w-3" /> Reject
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

