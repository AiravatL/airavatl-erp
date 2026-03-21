"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { getDeliveryRequest, cancelDeliveryRequest, type AuctionBidRow, type AuctionDetailResponse } from "@/lib/api/delivery-requests";
import { apiRequest } from "@/lib/api/http";
import { useAuth } from "@/lib/auth/auth-context";
import { AdminDeleteDialog } from "@/components/shared/admin-delete-dialog";
import { queryKeys } from "@/lib/query/keys";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { VEHICLE_TYPE_LABELS, DELIVERY_REQUEST_STATUS_LABELS, CARGO_TYPE_LABELS } from "@/lib/types";
import type { DeliveryRequestStatus, VehicleTypeRequired, CargoType } from "@/lib/types";
import {
  ArrowLeft,
  MapPin,
  Clock,
  Timer,
  TrendingUp,
  Loader2,
  XCircle,
  Pencil,
  Trash2,
  Truck,
} from "lucide-react";

const STATUS_COLORS: Record<DeliveryRequestStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-blue-100 text-blue-700",
  ended: "bg-green-100 text-green-700",
  winner_selected: "bg-purple-100 text-purple-700",
  trip_created: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  incomplete: "bg-gray-100 text-gray-600",
};

const BID_STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-100 text-blue-700",
  shortlisted: "bg-amber-100 text-amber-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-gray-100 text-gray-600",
  withdrawn: "bg-gray-100 text-gray-600",
  rejected: "bg-red-100 text-red-700",
};

export default function AuctionDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "admin";
  const isOps = user?.role === "operations";
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [startTripOpen, setStartTripOpen] = useState(false);
  const [selectedBid, setSelectedBid] = useState<AuctionBidRow | null>(null);
  const [consignerTripAmount, setConsignerTripAmount] = useState("");

  const { data, isLoading, error: fetchError } = useQuery({
    queryKey: queryKeys.deliveryRequest(requestId),
    queryFn: () => getDeliveryRequest(requestId),
    staleTime: 10_000,
    refetchInterval: (query) => {
      const status = (query.state.data?.request as Record<string, unknown>)?.status;
      return status === "active" ? 10_000 : 60_000;
    },
  });

  const req = data?.request as Record<string, unknown> | undefined;
  const bids = data?.bids ?? [];
  const winnerSelection = data?.winner_selection;
  const erpMetadata = data?.erp_metadata;
  const isErpAuction = !!erpMetadata;

  const status = req?.status as DeliveryRequestStatus | undefined;
  const statusLabel = status ? (DELIVERY_REQUEST_STATUS_LABELS[status] ?? status) : "";
  const statusColor = status ? (STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700") : "";
  const canSelectWinner = (status === "active" || status === "ended") && bids.some((b) => b.status === "active");

  // Fetch commission settings for ERP auctions
  const commissionQuery = useQuery({
    queryKey: ["settings", "commission"],
    queryFn: () => apiRequest<{ commission_percentage: number; minimum_commission_percentage: number }>("/api/settings/commission"),
    enabled: isErpAuction && canSelectWinner,
    staleTime: 5 * 60_000,
  });
  const commissionPct = commissionQuery.data?.commission_percentage ?? 10;
  const minCommissionPct = commissionQuery.data?.minimum_commission_percentage ?? 5;

  const cancelMutation = useMutation({
    mutationFn: () => cancelDeliveryRequest(requestId, cancelReason.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.deliveryRequest(requestId) });
      queryClient.invalidateQueries({ queryKey: ["delivery-requests"] });
      setCancelDialogOpen(false);
    },
  });

  const startTripMutation = useMutation({
    mutationFn: () =>
      apiRequest<{ trip_id: string; trip_number: string }>(`/api/delivery-requests/${requestId}/select-winner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bid_id: selectedBid?.id,
          consigner_trip_amount: Number(consignerTripAmount),
        }),
      }),
    onSuccess: (result) => {
      setStartTripOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.deliveryRequest(requestId) });
      queryClient.invalidateQueries({ queryKey: ["delivery-requests"] });
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      router.push(`/trips/${result.trip_id}`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (fetchError || !req) {
    return (
      <div className="space-y-4">
        <Link
          href="/delivery-requests"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Delivery Requests
        </Link>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-red-600">
              {fetchError instanceof Error ? fetchError.message : "Auction not found"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const vehicleMasterName = (req.vehicle_master_name as string) ?? null;
  const vehicleLabel = vehicleMasterName
    || VEHICLE_TYPE_LABELS[req.vehicle_type as VehicleTypeRequired]
    || (req.vehicle_type as string);

  return (
    <>
      {/* Header */}
      <Link
        href="/delivery-requests"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Delivery Requests
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-gray-900">
              {req.request_number as string}
            </h1>
            <Badge variant="outline" className={`border-0 font-medium text-xs ${statusColor}`}>
              {statusLabel}
            </Badge>
          </div>
          <p className="text-sm text-gray-500">
            {req.pickup_city as string} → {req.delivery_city as string} · {vehicleLabel}
            {req.estimated_distance_km ? ` · ${req.estimated_distance_km} km` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status === "active" && bids.length === 0 && (
            <Link href={`/delivery-requests/new?edit=${requestId}`}>
              <Button variant="outline" className="h-9 text-sm">
                <Pencil className="h-4 w-4 mr-1.5" />
                Edit
              </Button>
            </Link>
          )}
          {status === "active" && (
            <Button
              variant="outline"
              className="h-9 text-sm text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setCancelDialogOpen(true)}
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              Cancel
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              className="h-9 text-sm text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column */}
        <div className="space-y-4">
          {/* Request Info */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Request Details</h3>

              {/* Pickup */}
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">Pickup</p>
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-gray-900">
                      {req.pickup_formatted_address as string}
                    </p>
                    {((req.pickup_contact_name as string) || (req.pickup_contact_phone as string)) ? (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {req.pickup_contact_name as string}
                        {req.pickup_contact_phone ? ` · ${req.pickup_contact_phone}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Delivery */}
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">Delivery</p>
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-gray-900">
                      {req.delivery_formatted_address as string}
                    </p>
                    {((req.delivery_contact_name as string) || (req.delivery_contact_phone as string)) ? (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {req.delivery_contact_name as string}
                        {req.delivery_contact_phone ? ` · ${req.delivery_contact_phone}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3 space-y-2">
                <DetailRow label="Vehicle Type" value={vehicleLabel} />
                {(req.estimated_distance_km as number) ? (
                  <DetailRow label="Distance" value={`${req.estimated_distance_km} km`} />
                ) : null}
                {(req.estimated_duration_minutes as number) ? (
                  <DetailRow
                    label="Duration"
                    value={`~${Math.floor((req.estimated_duration_minutes as number) / 60)}h ${(req.estimated_duration_minutes as number) % 60}m`}
                  />
                ) : null}
                {(req.cargo_weight_kg as number) ? (
                  <DetailRow
                    label="Cargo Weight"
                    value={`${Number(req.cargo_weight_kg).toLocaleString()} kg`}
                  />
                ) : null}
                {(req.cargo_type as string) ? (
                  <DetailRow
                    label="Cargo Type"
                    value={CARGO_TYPE_LABELS[req.cargo_type as CargoType] ?? (req.cargo_type as string)}
                  />
                ) : null}
                <DetailRow
                  label="Schedule Date"
                  value={formatDate(req.consignment_date as string)}
                />
                {(req.special_instructions as string) ? (
                  <DetailRow label="Instructions" value={req.special_instructions as string} />
                ) : null}
                {(req.cargo_description as string) ? (
                  <DetailRow label="Description" value={req.cargo_description as string} />
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* ERP Metadata */}
          {erpMetadata && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">ERP Info</h3>
                <div className="space-y-2">
                  <DetailRow label="Created By" value={erpMetadata.created_by_name} />
                  {erpMetadata.consigner_profile_name && (
                    <DetailRow label="Consigner" value={erpMetadata.consigner_profile_name} />
                  )}
                  {erpMetadata.internal_notes && (
                    <div>
                      <p className="text-xs text-gray-500">Internal Notes</p>
                      <p className="text-sm text-gray-700 mt-0.5">{erpMetadata.internal_notes}</p>
                    </div>
                  )}
                  <DetailRow label="Created" value={formatDate(erpMetadata.created_at)} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Auction Status */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Auction Status</h3>
              <AuctionStatusSection req={req} />
            </CardContent>
          </Card>

          {/* Bids */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Bids ({bids.length})
              </h3>
              {bids.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">
                  No bids yet{status === "active" ? " — waiting for drivers to bid" : ""}
                </p>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="px-3 py-2 text-left font-medium text-gray-500">#</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Bidder</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Type</th>
                          {!(isOps && isErpAuction) && (
                            <th className="px-3 py-2 text-right font-medium text-gray-500">Bid Amount</th>
                          )}
                          {isErpAuction && canSelectWinner && (
                            <>
                              <th className="px-3 py-2 text-right font-medium text-gray-500">Expected Amount</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-500">Minimum Amount</th>
                            </>
                          )}
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Time</th>
                          {canSelectWinner && <th className="px-3 py-2 text-right font-medium text-gray-500">Action</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {bids.map((bid, idx) => (
                          <BidTableRow key={bid.id} bid={bid} rank={idx + 1}
                            showActionColumn={canSelectWinner}
                            hideBidAmount={isOps && isErpAuction}
                            showTripAmounts={isErpAuction && canSelectWinner}
                            commissionPct={commissionPct}
                            minCommissionPct={minCommissionPct}
                            canSelect={canSelectWinner && bid.status === "active"}
                            onSelect={() => { setSelectedBid(bid); setStartTripOpen(true); }} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile cards */}
                  <div className="sm:hidden space-y-2">
                    {bids.map((bid, idx) => (
                      <BidMobileCard key={bid.id} bid={bid} rank={idx + 1}
                        hideBidAmount={isOps && isErpAuction}
                        showTripAmounts={isErpAuction && canSelectWinner}
                        commissionPct={commissionPct}
                        minCommissionPct={minCommissionPct}
                        canSelect={canSelectWinner && bid.status === "active"}
                        onSelect={() => { setSelectedBid(bid); setStartTripOpen(true); }} />
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Winner Selection */}
          {winnerSelection && Object.keys(winnerSelection).length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Winner Selection</h3>
                <WinnerSelectionContent ws={winnerSelection as Record<string, unknown>} />
              </CardContent>
            </Card>
          )}

          {/* Cancellation Info */}
          {status === "cancelled" && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Cancellation</h3>
                <div className="space-y-2">
                  {(req.cancelled_reason as string) ? (
                    <DetailRow label="Reason" value={req.cancelled_reason as string} />
                  ) : null}
                  {(req.cancelled_at as string) ? (
                    <DetailRow label="Cancelled At" value={formatDate(req.cancelled_at as string)} />
                  ) : null}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Auction</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Are you sure you want to cancel auction{" "}
              <span className="font-medium">{req.request_number as string}</span>?
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="cancelReason" className="text-sm font-medium">
                Reason (optional)
              </Label>
              <Textarea
                id="cancelReason"
                placeholder="Why is this auction being cancelled?"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value.slice(0, 500))}
                rows={3}
                className="text-sm resize-none"
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={cancelMutation.isPending}
              className="h-9 text-sm"
            >
              Keep Active
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="h-9 text-sm"
            >
              {cancelMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Confirm Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start Trip Dialog */}
      <Dialog open={startTripOpen} onOpenChange={(o) => { if (!o && !startTripMutation.isPending) { setStartTripOpen(false); setConsignerTripAmount(""); startTripMutation.reset(); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Start Trip</DialogTitle>
            <DialogDescription>
              Select <span className="font-semibold">{selectedBid?.bidder_name}</span> as the winner
              and create a trip with bid amount <span className="font-semibold">{selectedBid ? formatCurrency(selectedBid.bid_amount) : ""}</span>.
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const bidAmt = selectedBid?.bid_amount ?? 0;
            const suggestedAmt = Math.round(bidAmt * (1 + commissionPct / 100));
            const minimumAmt = Math.round(bidAmt * (1 + minCommissionPct / 100));
            const enteredAmt = Number(consignerTripAmount) || 0;
            const isBelowMinimum = enteredAmt > 0 && enteredAmt < minimumAmt;

            return (
              <div className="space-y-3 py-2">
                {/* Bid & Commission Info */}
                <div className="rounded-lg bg-gray-50 p-3 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Bidder</span>
                    <span className="text-gray-900">{selectedBid?.bidder_name}</span>
                  </div>
                  {!isOps && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Driver Bid</span>
                      <span className="font-medium text-gray-900">{formatCurrency(bidAmt)}</span>
                    </div>
                  )}
                  <div className="border-t border-gray-200 pt-1.5 mt-1.5 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Expected Trip Amount</span>
                      <span className="font-medium text-blue-700">{formatCurrency(suggestedAmt)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Minimum Trip Amount</span>
                      <span className="font-medium text-amber-700">{formatCurrency(minimumAmt)}</span>
                    </div>
                  </div>
                </div>

                {/* Trip Amount Input */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">
                    Consigner Trip Amount <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder={`Min ${formatCurrency(minimumAmt)}`}
                    value={consignerTripAmount}
                    onChange={(e) => setConsignerTripAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    className={`h-9 text-sm ${isBelowMinimum ? "border-red-300 focus-visible:ring-red-400" : ""}`}
                  />
                  {isBelowMinimum && (
                    <p className="text-xs text-red-600">
                      Minimum trip amount is {formatCurrency(minimumAmt)}
                    </p>
                  )}
                  {!isOps && enteredAmt > 0 && !isBelowMinimum && (
                    <div className="flex justify-between text-xs pt-1">
                      <span className="text-gray-500">Margin</span>
                      <span className={`font-medium ${enteredAmt >= bidAmt ? "text-emerald-700" : "text-red-600"}`}>
                        {formatCurrency(enteredAmt - bidAmt)}
                        {" "}({((enteredAmt - bidAmt) / enteredAmt * 100).toFixed(1)}%)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {startTripMutation.isError && (
            <p className="text-sm text-red-600">
              {startTripMutation.error instanceof Error ? startTripMutation.error.message : "Failed to start trip"}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setStartTripOpen(false); setConsignerTripAmount(""); }} disabled={startTripMutation.isPending} className="h-9 text-sm">
              Cancel
            </Button>
            <Button size="sm"
              disabled={!consignerTripAmount || Number(consignerTripAmount) <= 0
                || Number(consignerTripAmount) < Math.round((selectedBid?.bid_amount ?? 0) * (1 + minCommissionPct / 100))
                || startTripMutation.isPending}
              onClick={() => startTripMutation.mutate()}
              className="h-9 text-sm">
              {startTripMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Truck className="h-4 w-4 mr-1.5" />}
              Start Trip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Delete Dialog */}
      <AdminDeleteDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onDeleted={() => {
          queryClient.invalidateQueries({ queryKey: ["delivery-requests"] });
          router.push("/delivery-requests");
        }}
        type="auction"
        id={requestId}
        label={req.request_number as string}
        description={`Status: ${status}${bids.length > 0 ? ` · ${bids.length} bid(s) will be deleted` : ""}`}
      />
    </>
  );
}

function WinnerSelectionContent({ ws }: { ws: Record<string, unknown> }) {
  const deadline = ws.selection_deadline as string | null;
  const selectedBidId = ws.selected_bid_id as string | null;
  const tripId = ws.trip_id as string | null;

  return (
    <div className="space-y-2 text-sm">
      {deadline ? <DetailRow label="Deadline" value={formatDate(deadline)} /> : null}
      {selectedBidId ? (
        <p className="text-green-700">Winner has been selected</p>
      ) : (
        <p className="text-amber-600">Awaiting consigner selection in the app</p>
      )}
      {tripId ? <DetailRow label="Trip Created" value={tripId} /> : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 text-right">{value}</span>
    </div>
  );
}

function AuctionStatusSection({ req }: { req: Record<string, unknown> }) {
  const status = req.status as string;
  const auctionEndTime = req.auction_end_time as string | null;
  const auctionDuration = req.auction_duration_minutes as number | null;
  const totalBids = (req.total_bids_count as number) ?? 0;
  const lowestBid = req.lowest_bid_amount as number | null;

  const [timeLeft, setTimeLeft] = useState("");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (status !== "active" || !auctionEndTime) return;

    function update() {
      const now = Date.now();
      const end = new Date(auctionEndTime!).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft("Auction ended");
        setProgress(100);
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(
        hours > 0 ? `${hours}h ${mins}m ${secs}s` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`,
      );

      if (auctionDuration) {
        const totalMs = auctionDuration * 60000;
        const elapsed = totalMs - diff;
        setProgress(Math.min(100, Math.round((elapsed / totalMs) * 100)));
      }
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [status, auctionEndTime, auctionDuration]);

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-md border border-gray-100 p-3 text-center">
          <Timer className="h-4 w-4 text-gray-400 mx-auto mb-1" />
          <p className="text-xs text-gray-500">Duration</p>
          <p className="text-sm font-semibold text-gray-900">
            {auctionDuration ? (auctionDuration >= 60 ? `${auctionDuration / 60}h` : `${auctionDuration}m`) : "—"}
          </p>
        </div>
        <div className="rounded-md border border-gray-100 p-3 text-center">
          <TrendingUp className="h-4 w-4 text-gray-400 mx-auto mb-1" />
          <p className="text-xs text-gray-500">Bids</p>
          <p className="text-sm font-semibold text-gray-900">{totalBids}</p>
        </div>
        <div className="rounded-md border border-gray-100 p-3 text-center">
          <Clock className="h-4 w-4 text-gray-400 mx-auto mb-1" />
          <p className="text-xs text-gray-500">Lowest Bid</p>
          <p className="text-sm font-semibold text-gray-900">
            {lowestBid ? formatCurrency(lowestBid) : "—"}
          </p>
        </div>
      </div>

      {status === "active" && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Time Remaining</span>
            <span className="text-sm font-medium text-gray-900">{timeLeft}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {status === "ended" && (
        <p className="text-sm text-amber-600">
          Auction ended{auctionEndTime ? ` at ${formatDate(auctionEndTime)}` : ""}. Awaiting winner
          selection.
        </p>
      )}

      {status === "cancelled" && (
        <p className="text-sm text-red-600">
          Auction was cancelled{req.cancelled_reason ? ` — ${req.cancelled_reason}` : ""}.
        </p>
      )}

      {(status === "winner_selected" || status === "trip_created") && (
        <p className="text-sm text-green-700">
          {status === "winner_selected"
            ? "Winner has been selected"
            : status === "trip_created"
              ? "Trip has been created from this auction"
              : "Auction completed"}
        </p>
      )}
    </div>
  );
}

function BidTableRow({ bid, rank, showActionColumn, hideBidAmount, showTripAmounts, commissionPct, minCommissionPct, canSelect, onSelect }: {
  bid: AuctionBidRow; rank: number; showActionColumn?: boolean; hideBidAmount?: boolean; showTripAmounts?: boolean;
  commissionPct?: number; minCommissionPct?: number; canSelect?: boolean; onSelect?: () => void;
}) {
  const statusColor = BID_STATUS_COLORS[bid.status] ?? "bg-gray-100 text-gray-700";
  const statusLabel = bid.status.charAt(0).toUpperCase() + bid.status.slice(1);
  const typeLabel = bid.bidder_type === "individual_driver" ? "Driver" : "Transporter";
  const typeColor = bid.bidder_type === "individual_driver" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700";

  const suggestedAmt = showTripAmounts ? Math.round(bid.bid_amount * (1 + (commissionPct ?? 10) / 100)) : 0;
  const minimumAmt = showTripAmounts ? Math.round(bid.bid_amount * (1 + (minCommissionPct ?? 5) / 100)) : 0;

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-2 text-gray-500">{rank}</td>
      <td className="px-3 py-2">
        <p className="text-gray-900 font-medium">{bid.bidder_name}</p>
        {bid.bidder_phone && <p className="text-[11px] text-gray-400">{bid.bidder_phone}</p>}
      </td>
      <td className="px-3 py-2">
        <Badge variant="outline" className={`border-0 text-xs ${typeColor}`}>
          {typeLabel}
        </Badge>
      </td>
      {!hideBidAmount && (
        <td className="px-3 py-2 text-right font-medium text-gray-900">
          {formatCurrency(bid.bid_amount)}
        </td>
      )}
      {showTripAmounts && (
        <>
          <td className="px-3 py-2 text-right font-medium text-blue-700">
            {formatCurrency(suggestedAmt)}
          </td>
          <td className="px-3 py-2 text-right font-medium text-amber-600">
            {formatCurrency(minimumAmt)}
          </td>
        </>
      )}
      <td className="px-3 py-2">
        <Badge variant="outline" className={`border-0 font-medium text-xs ${statusColor}`}>
          {bid.status === "won" ? "Winner" : statusLabel}
        </Badge>
      </td>
      <td className="px-3 py-2 text-xs text-gray-500">{formatDate(bid.created_at)}</td>
      {showActionColumn && (
        <td className="px-3 py-2 text-right">
          {canSelect ? (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onSelect}>
              <Truck className="h-3 w-3" /> Start Trip
            </Button>
          ) : null}
        </td>
      )}
    </tr>
  );
}

function BidMobileCard({ bid, rank, hideBidAmount, showTripAmounts, commissionPct, minCommissionPct, canSelect, onSelect }: {
  bid: AuctionBidRow; rank: number; hideBidAmount?: boolean; showTripAmounts?: boolean;
  commissionPct?: number; minCommissionPct?: number; canSelect?: boolean; onSelect?: () => void;
}) {
  const statusColor = BID_STATUS_COLORS[bid.status] ?? "bg-gray-100 text-gray-700";
  const statusLabel = bid.status === "won" ? "Winner" : bid.status.charAt(0).toUpperCase() + bid.status.slice(1);
  const typeLabel = bid.bidder_type === "individual_driver" ? "Driver" : "Transporter";

  const suggestedAmt = showTripAmounts ? Math.round(bid.bid_amount * (1 + (commissionPct ?? 10) / 100)) : 0;
  const minimumAmt = showTripAmounts ? Math.round(bid.bid_amount * (1 + (minCommissionPct ?? 5) / 100)) : 0;

  return (
    <div className="rounded-md border border-gray-100 p-3">
      <div className="flex items-start justify-between mb-1">
        <div>
          <span className="text-xs text-gray-400 mr-2">#{rank}</span>
          <span className="text-sm font-medium text-gray-900">{bid.bidder_name}</span>
          {bid.bidder_phone && <span className="text-[11px] text-gray-400 ml-2">{bid.bidder_phone}</span>}
        </div>
        <Badge variant="outline" className={`border-0 font-medium text-xs ${statusColor}`}>
          {statusLabel}
        </Badge>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        <span>{typeLabel}</span>
        {!hideBidAmount && (
          <>
            <span>·</span>
            <span className="font-medium text-gray-900">{formatCurrency(bid.bid_amount)}</span>
          </>
        )}
        <span>·</span>
        <span>{formatDate(bid.created_at)}</span>
      </div>

      {showTripAmounts && (
        <div className="flex items-center gap-3 text-[11px] bg-gray-50 rounded px-2 py-1 mb-1.5">
          <span className="text-gray-500">Expected:</span>
          <span className="font-medium text-blue-700">{formatCurrency(suggestedAmt)}</span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-500">Min:</span>
          <span className="font-medium text-amber-600">{formatCurrency(minimumAmt)}</span>
        </div>
      )}

      {canSelect && (
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1 w-full mt-1" onClick={onSelect}>
          <Truck className="h-3 w-3" /> Start Trip
        </Button>
      )}
    </div>
  );
}
