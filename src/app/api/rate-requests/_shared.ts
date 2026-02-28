import { NextResponse } from "next/server";
import type { Role } from "@/lib/types";
import { requireRateActor } from "@/app/api/rates/_shared";

export const RATE_REQUEST_CREATOR_ROLES: Role[] = [
  "sales_consigner",
  "operations_consigner",
  "admin",
  "super_admin",
];

export const RATE_REQUEST_VIEW_ROLES: Role[] = [
  "sales_consigner",
  "operations_consigner",
  "sales_vehicles",
  "operations_vehicles",
  "admin",
  "super_admin",
];

export const RATE_REQUEST_PRICING_ROLES: Role[] = [
  "sales_vehicles",
  "operations_vehicles",
  "admin",
  "super_admin",
];

export const RATE_REQUEST_REVIEW_ROLES: Role[] = [
  "operations_vehicles",
  "admin",
  "super_admin",
];

export interface RateRequestRow {
  id: string;
  from_location: string;
  to_location: string;
  vehicle_type: string;
  vehicle_type_id: string;
  rate_category: string;
  notes: string | null;
  status: string;
  requested_by_id: string;
  requested_by_name: string | null;
  requested_by_role: string;
  published_rate_id: string | null;
  fulfilled_at: string | null;
  created_at: string;
  updated_at: string;
  latest_quote_id: string | null;
  latest_quote_status: string | null;
  latest_freight_rate: number | string | null;
  latest_quoted_by_id: string | null;
  latest_quoted_by_name: string | null;
  latest_quoted_at: string | null;
}

export interface RateRequestQuoteRow {
  id: string;
  rate_request_id: string;
  freight_rate: number | string;
  rate_per_ton: number | string | null;
  rate_per_kg: number | string | null;
  confidence_level: string | null;
  source: string | null;
  remarks: string | null;
  status: string;
  quoted_by_id: string;
  quoted_by_name: string | null;
  reviewed_by_id: string | null;
  reviewed_by_name: string | null;
  review_remarks: string | null;
  published_rate_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeRateRequestRow(row: RateRequestRow) {
  return {
    id: row.id,
    fromLocation: row.from_location,
    toLocation: row.to_location,
    vehicleType: row.vehicle_type,
    vehicleTypeId: row.vehicle_type_id,
    rateCategory: row.rate_category,
    notes: row.notes,
    status: row.status,
    requestedById: row.requested_by_id,
    requestedByName: row.requested_by_name ?? "Unknown",
    requestedByRole: row.requested_by_role,
    publishedRateId: row.published_rate_id,
    fulfilledAt: row.fulfilled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestQuoteId: row.latest_quote_id,
    latestQuoteStatus: row.latest_quote_status,
    latestFreightRate: toNumber(row.latest_freight_rate),
    latestQuotedById: row.latest_quoted_by_id,
    latestQuotedByName: row.latest_quoted_by_name,
    latestQuotedAt: row.latest_quoted_at,
  };
}

export function normalizeRateRequestQuoteRow(row: RateRequestQuoteRow) {
  return {
    id: row.id,
    rateRequestId: row.rate_request_id,
    freightRate: Number(row.freight_rate),
    ratePerTon: toNumber(row.rate_per_ton),
    ratePerKg: toNumber(row.rate_per_kg),
    confidenceLevel: row.confidence_level,
    source: row.source,
    remarks: row.remarks,
    status: row.status,
    quotedById: row.quoted_by_id,
    quotedByName: row.quoted_by_name ?? "Unknown",
    reviewedById: row.reviewed_by_id,
    reviewedByName: row.reviewed_by_name,
    reviewRemarks: row.review_remarks,
    publishedRateId: row.published_rate_id,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function requireRateRequestActor(allowedRoles?: Role[]) {
  return requireRateActor(allowedRoles);
}

export function mapRateRequestRpcError(message: string, code?: string) {
  if (code === "PGRST202" || message?.includes("Could not find the function")) {
    return NextResponse.json({ ok: false, message: "Missing RPC in database" }, { status: 500 });
  }

  if (message?.includes("permission_denied") || code === "42501") {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }
  if (message?.includes("actor_not_found")) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  if (message?.includes("request_not_found")) {
    return NextResponse.json({ ok: false, message: "Rate request not found" }, { status: 404 });
  }
  if (message?.includes("quote_not_found")) {
    return NextResponse.json({ ok: false, message: "Rate quote not found" }, { status: 404 });
  }
  if (message?.includes("request_already_fulfilled")) {
    return NextResponse.json({ ok: false, message: "Rate request is already fulfilled" }, { status: 409 });
  }
  if (message?.includes("request_cancelled")) {
    return NextResponse.json({ ok: false, message: "Rate request is cancelled" }, { status: 400 });
  }
  if (message?.includes("pending_quote_exists")) {
    return NextResponse.json({ ok: false, message: "A quote is already pending review for this request" }, { status: 409 });
  }
  if (message?.includes("quote_not_pending_review")) {
    return NextResponse.json({ ok: false, message: "Quote is not pending review" }, { status: 400 });
  }
  if (message?.includes("review_remarks_required")) {
    return NextResponse.json({ ok: false, message: "Review remarks are required for rejection" }, { status: 400 });
  }
  if (message?.includes("unknown_vehicle_type")) {
    return NextResponse.json(
      { ok: false, message: "Please select a valid vehicle type from Vehicle Master" },
      { status: 400 },
    );
  }
  if (message?.includes("from_location_required") || message?.includes("to_location_required") || message?.includes("vehicle_type_required")) {
    return NextResponse.json({ ok: false, message: "fromLocation, toLocation and vehicleType are required" }, { status: 400 });
  }
  if (message?.includes("freight_rate_invalid") || message?.includes("rate_per_ton_invalid") || message?.includes("rate_per_kg_invalid")) {
    return NextResponse.json({ ok: false, message: "Invalid rate values" }, { status: 400 });
  }
  if (message?.includes("invalid_action")) {
    return NextResponse.json({ ok: false, message: "Invalid action" }, { status: 400 });
  }
  if (code === "22023" || code === "22P02") {
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
  if (code === "23505") {
    return NextResponse.json({ ok: false, message: "Duplicate pending quote" }, { status: 409 });
  }
  if (code === "P0002") {
    return NextResponse.json({ ok: false, message }, { status: 404 });
  }
  return NextResponse.json({ ok: false, message: message || "Request failed" }, { status: 500 });
}
