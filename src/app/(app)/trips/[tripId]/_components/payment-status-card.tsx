"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SignedImagePreview } from "@/components/shared/signed-image-preview";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { TripPaymentRequestItem, TripPaymentSummary } from "@/lib/api/trips";
import type { AppTripStatus, Role } from "@/lib/types";
import { Banknote, CheckCircle2, Clock, Loader2 } from "lucide-react";

interface PaymentStatusCardProps {
  type: "advance" | "final";
  paymentRequests: TripPaymentRequestItem[];
  paymentSummary: TripPaymentSummary | null;
  tripStatus: AppTripStatus;
  userRole: Role;
  onRequestPayment?: () => void;
  isRequesting?: boolean;
}

const ADVANCE_VISIBLE_FROM = new Set<AppTripStatus>([
  "loading",
  "in_transit",
  "at_delivery",
  "unloading",
  "completed",
]);

const FINAL_VISIBLE_FROM = new Set<AppTripStatus>([
  "in_transit",
  "at_delivery",
  "unloading",
  "completed",
]);

const CAN_REQUEST_ROLES = new Set<Role>([
  "operations",
  "admin",
  "super_admin",
]);

export function PaymentStatusCard({
  type,
  paymentRequests,
  paymentSummary,
  tripStatus,
  userRole,
  onRequestPayment,
  isRequesting,
}: PaymentStatusCardProps) {
  const visibleStatuses = type === "advance" ? ADVANCE_VISIBLE_FROM : FINAL_VISIBLE_FROM;
  if (!visibleStatuses.has(tripStatus)) return null;

  const typeFilter = type === "advance" ? "advance" : "balance";
  const requests = paymentRequests.filter((r) => r.type === typeFilter);
  const paidRequest = requests.find((r) => r.status === "paid");
  const pendingRequest = requests.find(
    (r) => r.status === "pending" || r.status === "approved",
  );

  const canRequest = CAN_REQUEST_ROLES.has(userRole);
  const label = type === "advance" ? "Advance Payment" : "Final Payment";
  const hasRequest = requests.length > 0;

  // State: Paid
  if (paidRequest) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800">{label}</p>
                <p className="text-xs text-green-600">
                  Paid — {formatCurrency(paidRequest.amount)}
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="border-green-300 bg-green-100 text-green-700"
            >
              Paid
            </Badge>
          </div>
          {paidRequest.reviewedAt && (
            <p className="mt-2 text-xs text-green-600">
              Paid on {formatDate(paidRequest.reviewedAt)}
              {paidRequest.reviewedByName
                ? ` by ${paidRequest.reviewedByName}`
                : ""}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // State: Pending
  if (pendingRequest) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-800">{label}</p>
                <p className="text-xs text-amber-600">
                  {formatCurrency(pendingRequest.amount)} — Awaiting accounts
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-100 text-amber-700"
            >
              {pendingRequest.status === "approved" ? "Approved" : "Pending"}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-amber-600">
            Requested on {formatDate(pendingRequest.createdAt)}
            {pendingRequest.requestedByName
              ? ` by ${pendingRequest.requestedByName}`
              : ""}
          </p>
          {pendingRequest.upiQrObjectKey && (
            <SignedImagePreview
              objectKey={pendingRequest.upiQrObjectKey}
              label="UPI QR"
            />
          )}
        </CardContent>
      </Card>
    );
  }

  // State: No request yet
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
              <Banknote className="h-5 w-5 text-gray-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{label}</p>
              <p className="text-xs text-gray-500">
                {hasRequest ? "Request rejected" : "No request created yet"}
              </p>
            </div>
          </div>
          {canRequest && onRequestPayment && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={onRequestPayment}
              disabled={isRequesting}
            >
              {isRequesting && (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              )}
              Request {type === "advance" ? "Advance" : "Final"}
            </Button>
          )}
        </div>
        {paymentSummary && type === "advance" && (
          <p className="mt-2 text-xs text-gray-500">
            Trip amount: {formatCurrency(paymentSummary.tripAmount)}
          </p>
        )}
        {paymentSummary && type === "final" && (
          <p className="mt-2 text-xs text-gray-500">
            Suggested final: {formatCurrency(paymentSummary.suggestedFinalAmount)}
            {paymentSummary.paidAdvanceTotal > 0
              ? ` (advance paid: ${formatCurrency(paymentSummary.paidAdvanceTotal)})`
              : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
