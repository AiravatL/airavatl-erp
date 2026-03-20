"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatCurrency,
  formatDate,
} from "@/lib/formatters";
import {
  VEHICLE_TYPE_LABELS,
  CARGO_TYPE_LABELS,
  type AppTripStatus,
  type VehicleTypeRequired,
  type CargoType,
} from "@/lib/types";
import type {
  AuctionTripDetail,
  TripPaymentSummary,
} from "@/lib/api/trips";
import { TripTimeline } from "./_components/trip-timeline";
import {
  MapPin,
  DollarSign,
  Shield,
  ExternalLink,
  Info,
  CreditCard,
} from "lucide-react";

interface DetailsTabProps {
  data: AuctionTripDetail;
  status: AppTripStatus;
  isOps: boolean;
  isErp?: boolean;
  paymentSummary: TripPaymentSummary | null;
}

export function DetailsTab({
  data,
  status,
  isOps,
  isErp,
  paymentSummary,
}: DetailsTabProps) {
  const trip = data.trip;
  const erpMeta = data.erp_metadata;
  const reqMeta = data.request_metadata;

  const vehicleLabel =
    VEHICLE_TYPE_LABELS[trip.vehicle_type as VehicleTypeRequired] ??
    (trip.vehicle_type as string);
  const bidAmount = trip.trip_amount as number;
  const consignerAmount = erpMeta?.consigner_trip_amount ?? null;
  const margin = consignerAmount != null ? consignerAmount - bidAmount : null;

  return (
    <div className="space-y-4">
      {/* 1. Trip Info */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">Trip Info</h3>
          </div>

          {/* Pickup */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">
              Pickup
            </p>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-gray-900">
                  {trip.pickup_formatted_address as string}
                </p>
                {((trip.pickup_contact_name as string) ||
                  (trip.pickup_contact_phone as string)) && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {trip.pickup_contact_name as string}
                    {trip.pickup_contact_phone
                      ? ` · ${trip.pickup_contact_phone}`
                      : ""}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Delivery */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">
              Delivery
            </p>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-gray-900">
                  {trip.delivery_formatted_address as string}
                </p>
                {((trip.delivery_contact_name as string) ||
                  (trip.delivery_contact_phone as string)) && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {trip.delivery_contact_name as string}
                    {trip.delivery_contact_phone
                      ? ` · ${trip.delivery_contact_phone}`
                      : ""}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3 space-y-2">
            <DetailRow label="Vehicle Type" value={vehicleLabel} />
            {(trip.estimated_distance_km as number) ? (
              <DetailRow
                label="Distance"
                value={`${trip.estimated_distance_km} km`}
              />
            ) : null}
            {(trip.estimated_duration_minutes as number) ? (
              <DetailRow
                label="Duration"
                value={`~${Math.floor((trip.estimated_duration_minutes as number) / 60)}h ${(trip.estimated_duration_minutes as number) % 60}m`}
              />
            ) : null}
            {(trip.cargo_weight_kg as number) ? (
              <DetailRow
                label="Cargo Weight"
                value={`${Number(trip.cargo_weight_kg).toLocaleString()} kg`}
              />
            ) : null}
            {(trip.cargo_type as string) ? (
              <DetailRow
                label="Cargo Type"
                value={
                  CARGO_TYPE_LABELS[trip.cargo_type as CargoType] ??
                  (trip.cargo_type as string)
                }
              />
            ) : null}
            <DetailRow
              label="Schedule Date"
              value={formatDate(trip.consignment_date as string)}
            />
            {(trip.special_instructions as string) ? (
              <DetailRow
                label="Instructions"
                value={trip.special_instructions as string}
              />
            ) : null}
            {(trip.cargo_description as string) ? (
              <DetailRow
                label="Description"
                value={trip.cargo_description as string}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* 2. ERP Info */}
      {reqMeta && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Info className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-900">ERP Info</h3>
            </div>
            <div className="space-y-2">
              <DetailRow label="Created By" value={reqMeta.created_by_name} />
              {reqMeta.consigner_profile_name && (
                <DetailRow
                  label="Consigner"
                  value={reqMeta.consigner_profile_name}
                />
              )}
              {erpMeta?.selected_by_name && (
                <DetailRow
                  label="Winner Selected By"
                  value={erpMeta.selected_by_name}
                />
              )}
              {reqMeta.internal_notes && (
                <div>
                  <p className="text-xs text-gray-500">Internal Notes</p>
                  <p className="text-sm text-gray-700 mt-0.5">
                    {reqMeta.internal_notes}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Financial Summary (hidden from ops) */}
      {!isOps && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-900">
                Financial Summary
              </h3>
            </div>
            <div className="space-y-2">
              <DetailRow
                label="Bid Amount (Driver)"
                value={formatCurrency(bidAmount)}
              />
              <DetailRow
                label="Trip Amount (Consigner)"
                value={
                  consignerAmount != null
                    ? formatCurrency(consignerAmount)
                    : "—"
                }
              />
              {margin != null && (
                <div className="flex justify-between gap-4 pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-500 shrink-0">Margin</span>
                  <span
                    className={`text-sm font-semibold ${margin >= 0 ? "text-green-700" : "text-red-600"}`}
                  >
                    {formatCurrency(margin)}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4. Payment Summary */}
      {paymentSummary && !isOps && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="h-4 w-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-900">
                Payment Summary
              </h3>
            </div>
            <div className="space-y-2">
              <DetailRow
                label="Paid Advance"
                value={formatCurrency(paymentSummary.paidAdvanceTotal)}
              />
              <DetailRow
                label="Pending Advance"
                value={formatCurrency(paymentSummary.pendingAdvanceTotal)}
              />
              <DetailRow
                label="Suggested Final"
                value={formatCurrency(paymentSummary.suggestedFinalAmount)}
              />
              <DetailRow
                label="Paid Balance"
                value={formatCurrency(paymentSummary.paidBalanceTotal)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5. Auction Origin */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">
              Auction Origin
            </h3>
          </div>
          <div className="space-y-2">
            <DetailRow
              label="Delivery Request"
              value={data.request_number ?? "—"}
            />
            <DetailRow
              label="Request Status"
              value={data.delivery_request_status ?? "—"}
            />
            <Link
              href={`/delivery-requests/${data.request_id}`}
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mt-2"
            >
              View Delivery Request
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* 6. Timeline */}
      <TripTimeline trip={trip} currentStatus={status} isErp={isErp} />
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
