"use client";

import type { AppTripStatus, Role } from "@/lib/types";
import type {
  AuctionTripDetail,
  DriverLocationResponse,
  TripPaymentRequestItem,
  TripPaymentSummary,
  TripLoadingProofItem,
} from "@/lib/api/trips";
import { DriverLocationMap } from "./_components/driver-location-map";
import { OtpDisplayCard } from "./_components/otp-display-card";
import { PaymentStatusCard } from "./_components/payment-status-card";
import { ProofViewCard } from "./_components/proof-view-card";
import { DriverInfoCard } from "./_components/driver-info-card";

interface ActionsTabProps {
  data: AuctionTripDetail;
  status: AppTripStatus;
  userRole: Role;
  isOps: boolean;
  tripId: string;
  driverLocation: DriverLocationResponse | null;
  paymentRequests: TripPaymentRequestItem[];
  paymentSummary: TripPaymentSummary | null;
  loadingProofs: TripLoadingProofItem[];
  podProofs: TripLoadingProofItem[];
  isLoadingProofs: boolean;
  onRequestAdvance?: () => void;
  onRequestFinal?: () => void;
}

export function ActionsTab({
  data,
  status,
  userRole,
  isOps,
  tripId,
  driverLocation,
  paymentRequests,
  paymentSummary,
  loadingProofs,
  podProofs,
  isLoadingProofs,
  onRequestAdvance,
  onRequestFinal,
}: ActionsTabProps) {
  const trip = data.trip;
  const bid = data.bid as Record<string, unknown> | null;

  const pickupLat = (trip.pickup_latitude as number) ?? null;
  const pickupLng = (trip.pickup_longitude as number) ?? null;
  const deliveryLat = (trip.delivery_latitude as number) ?? null;
  const deliveryLng = (trip.delivery_longitude as number) ?? null;

  return (
    <div className="space-y-4">
      {/* 1. Driver Location Map */}
      <DriverLocationMap
        tripId={tripId}
        driverLocation={driverLocation}
        pickupLat={pickupLat}
        pickupLng={pickupLng}
        deliveryLat={deliveryLat}
        deliveryLng={deliveryLng}
        tripStatus={status}
      />

      {/* 2. OTP Display Card */}
      <OtpDisplayCard
        status={status}
        pickupOtp={(trip.pickup_otp as string) ?? null}
        isOps={isOps}
        pickupCompletedAt={(trip.pickup_completed_at as string) ?? null}
      />

      {/* 3. Advance Payment Card */}
      <PaymentStatusCard
        type="advance"
        paymentRequests={paymentRequests}
        paymentSummary={paymentSummary}
        tripStatus={status}
        userRole={userRole}
        onRequestPayment={onRequestAdvance}
      />

      {/* 4. Final Payment Card */}
      <PaymentStatusCard
        type="final"
        paymentRequests={paymentRequests}
        paymentSummary={paymentSummary}
        tripStatus={status}
        userRole={userRole}
        onRequestPayment={onRequestFinal}
      />

      {/* 5. Loading Proof Card */}
      <ProofViewCard
        title="Loading Proof"
        proofs={loadingProofs}
        isLoading={isLoadingProofs}
      />

      {/* 6. Delivery Proof (POD) Card */}
      <ProofViewCard
        title="Delivery Proof (POD)"
        proofs={podProofs}
        isLoading={isLoadingProofs}
      />

      {/* 7. Driver Info Card */}
      {bid && (
        <DriverInfoCard bid={bid} tripStatus={status} isOps={isOps} />
      )}
    </div>
  );
}
