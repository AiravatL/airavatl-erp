import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import type { Role, TripStage } from "@/lib/types";

export const dynamic = "force-dynamic";

const TRIP_ALLOWED_ROLES: Role[] = [
  "super_admin",
  "admin",
  "operations_consigner",
  "operations_vehicles",
  "sales_consigner",
];

export interface TripActor {
  id: string;
  role: Role;
}

export interface TripRow {
  id: string;
  trip_code: string;
  customer_id: string;
  customer_name: string;
  pickup_location: string | null;
  drop_location: string | null;
  route: string | null;
  current_stage: string;
  leased_flag: boolean;
  vehicle_type: string | null;
  vehicle_length: string | null;
  weight_estimate: number | string | null;
  planned_km: number | string | null;
  schedule_date: string | null;
  trip_amount: number | string | null;
  requested_by_id: string | null;
  requested_by_name: string | null;
  vehicle_id: string | null;
  vehicle_number: string | null;
  driver_name: string | null;
  driver_phone?: string | null;
  vendor_id: string | null;
  vendor_name?: string | null;
  vendor_phone?: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  sales_consigner_owner_id: string | null;
  sales_consigner_owner_name: string | null;
  operations_consigner_owner_id: string | null;
  operations_consigner_owner_name: string | null;
  operations_vehicles_owner_id: string | null;
  operations_vehicles_owner_name: string | null;
  accounts_owner_id: string | null;
  accounts_owner_name: string | null;
  started_at?: string | null;
  started_by_id?: string | null;
  completed_at?: string | null;
  completed_by_id?: string | null;
}

export interface NormalizedTrip {
  id: string;
  tripCode: string;
  customerId: string;
  customerName: string;
  pickupLocation: string;
  dropLocation: string;
  route: string;
  currentStage: TripStage;
  leasedFlag: boolean;
  vehicleType: string;
  vehicleLength: string;
  weightEstimate: number;
  plannedKm: number;
  scheduleDate: string;
  tripAmount: number | null;
  requestedById: string;
  requestedByName: string;
  salesOwnerId: string;
  salesOwnerName: string;
  opsOwnerId: string;
  opsOwnerName: string;
  opsVehiclesOwnerId: string;
  opsVehiclesOwnerName: string;
  accountsOwnerId: string;
  accountsOwnerName: string;
  vehicleId: string | null;
  vehicleNumber: string | null;
  driverName: string | null;
  driverPhone: string | null;
  vendorId: string | null;
  vendorName: string | null;
  vendorPhone: string | null;
  startedAt: string | null;
  startedById: string | null;
  completedAt: string | null;
  completedById: string | null;
  createdAt: string;
  updatedAt: string;
  internalNotes: string;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeTripRow(row: TripRow): NormalizedTrip {
  return {
    id: row.id,
    tripCode: row.trip_code,
    customerId: row.customer_id,
    customerName: row.customer_name ?? "",
    pickupLocation: row.pickup_location ?? "",
    dropLocation: row.drop_location ?? "",
    route: row.route ?? "",
    currentStage: row.current_stage as TripStage,
    leasedFlag: row.leased_flag,
    vehicleType: row.vehicle_type ?? "",
    vehicleLength: row.vehicle_length ?? "",
    weightEstimate: toNumber(row.weight_estimate),
    plannedKm: toNumber(row.planned_km),
    scheduleDate: row.schedule_date ?? "",
    tripAmount: toNullableNumber(row.trip_amount),
    requestedById: row.requested_by_id ?? "",
    requestedByName: row.requested_by_name ?? "Unknown",
    salesOwnerId: row.sales_consigner_owner_id ?? "",
    salesOwnerName: row.sales_consigner_owner_name ?? "",
    opsOwnerId: row.operations_consigner_owner_id ?? "",
    opsOwnerName: row.operations_consigner_owner_name ?? "",
    opsVehiclesOwnerId: row.operations_vehicles_owner_id ?? "",
    opsVehiclesOwnerName: row.operations_vehicles_owner_name ?? "",
    accountsOwnerId: row.accounts_owner_id ?? "",
    accountsOwnerName: row.accounts_owner_name ?? "",
    vehicleId: row.vehicle_id ?? null,
    vehicleNumber: row.vehicle_number ?? null,
    driverName: row.driver_name ?? null,
    driverPhone: row.driver_phone ?? null,
    vendorId: row.vendor_id ?? null,
    vendorName: row.vendor_name ?? null,
    vendorPhone: row.vendor_phone ?? null,
    startedAt: row.started_at ?? null,
    startedById: row.started_by_id ?? null,
    completedAt: row.completed_at ?? null,
    completedById: row.completed_by_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    internalNotes: row.internal_notes ?? "",
  };
}

export async function requireTripActor() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  const { data: role, error: rpcError } = await supabase.rpc("trip_assert_actor_v1", {
    p_actor_user_id: user.id,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return { error: NextResponse.json({ ok: false, message: "Missing RPC: trip_assert_actor_v1" }, { status: 500 }) };
    }
    return { error: mapRpcError(rpcError.message ?? "Unauthorized", rpcError.code) };
  }

  if (!role) {
    return { error: NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 }) };
  }

  const actor = { id: user.id, role: role as Role } satisfies TripActor;

  if (!TRIP_ALLOWED_ROLES.includes(actor.role)) {
    return { error: NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 }) };
  }

  return { supabase, actor };
}

export function mapRpcError(message: string, code?: string) {
  if (message?.includes("permission_denied")) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  if (message?.includes("not_customer_owner")) return NextResponse.json({ ok: false, message: "You can only create requests for your own customers" }, { status: 403 });
  if (message?.includes("not_request_owner")) return NextResponse.json({ ok: false, message: "You can only edit your own trip requests" }, { status: 403 });
  if (message?.includes("vehicle_type_required")) return NextResponse.json({ ok: false, message: "Vehicle type is required" }, { status: 400 });
  if (message?.includes("unknown_vehicle_type")) return NextResponse.json({ ok: false, message: "Please select a valid vehicle type from Vehicle Master" }, { status: 400 });
  if (message?.includes("unknown_vehicle_length")) return NextResponse.json({ ok: false, message: "Please select a valid vehicle length for selected type" }, { status: 400 });
  if (message?.includes("customer_not_found")) return NextResponse.json({ ok: false, message: "Customer not found" }, { status: 404 });
  if (message?.includes("trip_not_found")) return NextResponse.json({ ok: false, message: "Trip not found" }, { status: 404 });
  if (message?.includes("trip_not_editable")) return NextResponse.json({ ok: false, message: "Trip can only be edited while in Request Received stage" }, { status: 400 });
  if (message?.includes("trip_not_pending")) return NextResponse.json({ ok: false, message: "Trip is not in Request Received stage" }, { status: 400 });
  if (message?.includes("trip_not_quoted")) return NextResponse.json({ ok: false, message: "Trip must be in Quoted stage to confirm" }, { status: 400 });
  if (message?.includes("trip_not_confirmed")) return NextResponse.json({ ok: false, message: "Trip must be in Confirmed stage to assign vehicle" }, { status: 400 });
  if (message?.includes("trip_not_vehicle_assigned")) return NextResponse.json({ ok: false, message: "Trip is not ready for this operation yet" }, { status: 400 });
  if (message?.includes("vehicle_not_found")) return NextResponse.json({ ok: false, message: "Vehicle not found" }, { status: 404 });
  if (message?.includes("vehicle_not_available")) return NextResponse.json({ ok: false, message: "Vehicle is not available" }, { status: 400 });
  if (message?.includes("driver_not_found")) return NextResponse.json({ ok: false, message: "Driver not found" }, { status: 404 });
  if (message?.includes("driver_inactive")) return NextResponse.json({ ok: false, message: "Selected driver is inactive" }, { status: 400 });
  if (message?.includes("driver_vendor_mismatch")) return NextResponse.json({ ok: false, message: "Selected driver does not belong to this vendor" }, { status: 400 });
  if (message?.includes("owner_driver_required_for_owner_vehicle")) return NextResponse.json({ ok: false, message: "Owner driver vehicle must use its owner driver" }, { status: 400 });
  if (message?.includes("driver_required_for_vendor_vehicle")) return NextResponse.json({ ok: false, message: "Vendor vehicle requires a driver from the same vendor" }, { status: 400 });
  if (message?.includes("vehicle_vendor_missing")) return NextResponse.json({ ok: false, message: "Vendor data missing for this vehicle" }, { status: 400 });
  if (message?.includes("not_trip_ops_vehicle_owner")) return NextResponse.json({ ok: false, message: "Only assigned vehicle ops owner can perform this action" }, { status: 403 });
  if (message?.includes("active_advance_exists")) return NextResponse.json({ ok: false, message: "An active advance request already exists for this trip" }, { status: 409 });
  if (message?.includes("amount_invalid")) return NextResponse.json({ ok: false, message: "Amount is invalid" }, { status: 400 });
  if (message?.includes("invalid_payment_method")) return NextResponse.json({ ok: false, message: "Payment method is required" }, { status: 400 });
  if (message?.includes("bank_details_required")) return NextResponse.json({ ok: false, message: "Bank details are required for bank payout" }, { status: 400 });
  if (message?.includes("upi_details_required")) return NextResponse.json({ ok: false, message: "Provide UPI ID or upload UPI QR" }, { status: 400 });
  if (message?.includes("file_name_required")) return NextResponse.json({ ok: false, message: "File name is required" }, { status: 400 });
  if (message?.includes("file_too_large")) return NextResponse.json({ ok: false, message: "File size is too large" }, { status: 400 });
  if (message?.includes("invalid_file_type")) return NextResponse.json({ ok: false, message: "Unsupported file type" }, { status: 400 });
  if (message?.includes("invalid_object_key")) return NextResponse.json({ ok: false, message: "Invalid upload object key" }, { status: 400 });
  if (message?.includes("invalid_payment_status")) return NextResponse.json({ ok: false, message: "Invalid payment status filter" }, { status: 400 });
  if (message?.includes("invalid_payment_type")) return NextResponse.json({ ok: false, message: "Invalid payment type filter" }, { status: 400 });
  if (message?.includes("payment_request_not_found")) return NextResponse.json({ ok: false, message: "Payment request not found" }, { status: 404 });
  if (message?.includes("payment_request_not_payable")) return NextResponse.json({ ok: false, message: "Payment request is not payable in current status" }, { status: 400 });
  if (message?.includes("payment_request_already_paid")) return NextResponse.json({ ok: false, message: "Payment request is already marked paid" }, { status: 409 });
  if (message?.includes("trip_already_completed")) return NextResponse.json({ ok: false, message: "Trip is already completed" }, { status: 409 });
  if (message?.includes("trip_amount_missing")) return NextResponse.json({ ok: false, message: "Trip amount is missing. Set trip amount before final payment request." }, { status: 400 });
  if (message?.includes("advance_not_paid_yet")) return NextResponse.json({ ok: false, message: "Final payment can be requested only after advance is paid" }, { status: 400 });
  if (message?.includes("final_amount_invalid")) return NextResponse.json({ ok: false, message: "Final payment amount is invalid" }, { status: 400 });
  if (message?.includes("active_final_payment_exists")) return NextResponse.json({ ok: false, message: "An active final payment request already exists for this trip" }, { status: 409 });
  if (message?.includes("ops_vehicles_user_not_found")) return NextResponse.json({ ok: false, message: "Selected vehicle ops user not found or inactive" }, { status: 400 });
  if (message?.includes("ops_vehicles_user_wrong_role")) return NextResponse.json({ ok: false, message: "Selected user is not a vehicle ops role" }, { status: 400 });
  if (message?.includes("actor_not_found")) return NextResponse.json({ ok: false, message: "User not found" }, { status: 401 });
  if (message?.includes("actor_inactive")) return NextResponse.json({ ok: false, message: "User account is inactive" }, { status: 403 });
  if (code === "23505") return NextResponse.json({ ok: false, message: "Duplicate trip code" }, { status: 409 });
  return NextResponse.json({ ok: false, message }, { status: 500 });
}
