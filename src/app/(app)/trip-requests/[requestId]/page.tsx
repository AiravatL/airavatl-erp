"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  getTripRequest, rejectTripRequest, cancelTripRequest, deleteTripRequest,
} from "@/lib/api/trip-requests";
import type { TripRequestDetail, TripRequestStatus } from "@/lib/api/trip-requests";
import { queryKeys } from "@/lib/query/keys";
import { useAuth } from "@/lib/auth/auth-context";
import { formatDate } from "@/lib/formatters";
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, Ban, ExternalLink, Trash2,
} from "lucide-react";

const STATUS_COLORS: Record<TripRequestStatus, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  converted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

const STATUS_LABELS: Record<TripRequestStatus, string> = {
  pending_review: "Pending review",
  converted: "Converted to auction",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export default function TripRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const detailQuery = useQuery({
    queryKey: queryKeys.tripRequest(requestId),
    queryFn: () => getTripRequest(requestId),
  });

  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");

  const rejectMutation = useMutation({
    mutationFn: () => rejectTripRequest(requestId, reason.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trip-requests"] });
      setRejectOpen(false);
      setReason("");
    },
    onError: (err) =>
      setActionError(err instanceof Error ? err.message : "Failed to reject"),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelTripRequest(requestId, reason.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trip-requests"] });
      setCancelOpen(false);
      setReason("");
    },
    onError: (err) =>
      setActionError(err instanceof Error ? err.message : "Failed to cancel"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTripRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trip-requests"] });
      router.push("/trip-requests");
    },
    onError: (err) =>
      setActionError(err instanceof Error ? err.message : "Failed to delete"),
  });

  if (detailQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }
  if (detailQuery.error || !detailQuery.data) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/trip-requests")} className="h-8 text-sm">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </Button>
        <Card><CardContent className="p-6 text-sm text-red-600">
          {detailQuery.error instanceof Error ? detailQuery.error.message : "Trip request not found"}
        </CardContent></Card>
      </div>
    );
  }

  const req = detailQuery.data;
  const role = user?.role;
  const isAdmin = role === "super_admin" || role === "admin";
  const isOps = isAdmin || role === "operations";
  const isCreator = req.created_by === user?.id;
  const isPending = req.status === "pending_review";

  const canAccept = isOps && isPending;
  const canReject = isOps && isPending;
  const canCancel = isPending && (isCreator || isOps);
  const canDelete = isAdmin && req.status !== "converted";

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <PageHeader title={`Trip Request ${req.request_number}`}>
        <Button variant="ghost" size="sm" onClick={() => router.push("/trip-requests")} className="h-8 text-sm">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </Button>
      </PageHeader>

      {/* Status + actions */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`border-0 text-xs font-medium ${STATUS_COLORS[req.status]}`}>
                  {STATUS_LABELS[req.status]}
                </Badge>
                <Badge variant="outline" className={`border-0 text-[10px] font-medium ${
                  req.source === "enterprise_portal" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
                }`}>
                  {req.source === "enterprise_portal" ? "Portal" : "Sales"}
                </Badge>
              </div>
              <p className="text-xs text-gray-500">Created {formatDate(req.created_at)}</p>
              {req.linked_delivery_request_number && req.delivery_request_id && (
                <p className="text-sm text-gray-700">
                  Converted to auction{" "}
                  <Link
                    href={`/delivery-requests/${req.delivery_request_id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {req.linked_delivery_request_number}
                  </Link>
                  <ExternalLink className="inline h-3 w-3 ml-1 text-blue-600" />
                </p>
              )}
              {req.status === "rejected" && req.rejection_reason && (
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Reason:</span> {req.rejection_reason}
                </p>
              )}
              {req.status === "cancelled" && req.cancelled_reason && (
                <p className="text-sm text-gray-700">
                  <span className="font-medium">Reason:</span> {req.cancelled_reason}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {canAccept && (
                <Button
                  onClick={() => router.push(`/delivery-requests/new?fromTripRequest=${req.id}`)}
                  className="h-9 text-sm"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Accept &amp; Create Auction
                </Button>
              )}
              {canReject && (
                <Button variant="outline" onClick={() => { setRejectOpen(true); setReason(""); setActionError(""); }} className="h-9 text-sm">
                  <XCircle className="h-4 w-4 mr-1.5" /> Reject
                </Button>
              )}
              {canCancel && (
                <Button variant="outline" onClick={() => { setCancelOpen(true); setReason(""); setActionError(""); }} className="h-9 text-sm">
                  <Ban className="h-4 w-4 mr-1.5" /> Cancel
                </Button>
              )}
              {canDelete && (
                <Button variant="outline"
                  onClick={() => { setDeleteOpen(true); setActionError(""); }}
                  className="h-9 text-sm text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">
                  <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <DetailCard req={req} />

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={(open) => { setRejectOpen(open); if (!open) setActionError(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject trip request</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">Reason <span className="text-red-500">*</span></Label>
            <Textarea rows={3} value={reason} maxLength={500}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              placeholder="Why is this request being rejected?" />
            {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              onClick={() => { setActionError(""); rejectMutation.mutate(); }}
              disabled={!reason.trim() || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setActionError(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently delete this trip request?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-gray-700">
            <p>
              Request <span className="font-medium">{req.request_number}</span> will be removed
              completely. This cannot be undone.
            </p>
            <p className="text-xs text-gray-500">
              Converted requests can&apos;t be deleted — their linked auction preserves the audit trail.
            </p>
            {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Keep</Button>
            <Button
              variant="destructive"
              onClick={() => { setActionError(""); deleteMutation.mutate(); }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onOpenChange={(open) => { setCancelOpen(open); if (!open) setActionError(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel trip request</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">Reason (optional)</Label>
            <Textarea rows={3} value={reason} maxLength={500}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              placeholder="Optional cancellation note" />
            {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep</Button>
            <Button
              onClick={() => { setActionError(""); cancelMutation.mutate(); }}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Cancel request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailCard({ req }: { req: TripRequestDetail }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6 space-y-6 text-sm">
        <Block title="Consigner">
          <Kv label="Name" value={req.consigner_display ?? "—"} />
          {req.consigner_business_name && <Kv label="Business" value={req.consigner_business_name} />}
          {req.consigner_phone && <Kv label="Phone" value={req.consigner_phone} />}
          {req.created_by_full_name && (
            <Kv label="Submitted by" value={`${req.created_by_full_name}${req.created_by_role ? ` · ${req.created_by_role}` : ""}`} />
          )}
        </Block>

        <Block title="Pickup">
          <Kv label="Address" value={req.pickup_address} />
          {(req.pickup_city || req.pickup_state) && (
            <Kv label="Location" value={[req.pickup_city, req.pickup_state].filter(Boolean).join(", ")} />
          )}
          {req.pickup_contact_name && <Kv label="Contact" value={`${req.pickup_contact_name}${req.pickup_contact_phone ? ` · ${req.pickup_contact_phone}` : ""}`} />}
        </Block>

        <Block title="Delivery">
          <Kv label="Address" value={req.delivery_address} />
          {(req.delivery_city || req.delivery_state) && (
            <Kv label="Location" value={[req.delivery_city, req.delivery_state].filter(Boolean).join(", ")} />
          )}
          {req.delivery_contact_name && <Kv label="Contact" value={`${req.delivery_contact_name}${req.delivery_contact_phone ? ` · ${req.delivery_contact_phone}` : ""}`} />}
        </Block>

        <Block title="Cargo">
          <Kv label="Description" value={req.cargo_description} />
          {req.cargo_weight_kg != null && (
            <Kv label="Weight" value={`${req.cargo_weight_kg.toLocaleString("en-IN")} kg`} />
          )}
          {req.cargo_type && <Kv label="Type" value={req.cargo_type} />}
          {req.special_instructions && <Kv label="Special instructions" value={req.special_instructions} />}
        </Block>

        {(req.preferred_pickup_at || req.notes) && (
          <Block title="Preferences">
            {req.preferred_pickup_at && (
              <Kv label="Preferred pickup" value={formatDate(req.preferred_pickup_at)} />
            )}
            {req.notes && <Kv label="Notes" value={req.notes} />}
          </Block>
        )}
      </CardContent>
    </Card>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="col-span-2 text-gray-900">{value}</span>
    </div>
  );
}
