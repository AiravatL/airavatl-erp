import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import type { Role } from "@/lib/types";

export const TRIP_REQUEST_VIEW_ROLES: Role[] = [
  "super_admin",
  "admin",
  "operations",
  "sales_consigner",
];

export const TRIP_REQUEST_OPS_ROLES: Role[] = [
  "super_admin",
  "admin",
  "operations",
];

export const TRIP_REQUEST_ADMIN_ROLES: Role[] = [
  "super_admin",
  "admin",
];

export async function requireTripRequestActor(allowedRoles: Role[] = TRIP_REQUEST_VIEW_ROLES) {
  const actorResult = await requireServerActor(allowedRoles);
  if ("error" in actorResult) return actorResult;
  return { supabase: actorResult.supabase, actor: actorResult.actor };
}

export function mapTripRequestRpcError(message: string, code?: string) {
  if (code === "42501" || message?.includes("forbidden")) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }
  if (message?.includes("not_found")) {
    return NextResponse.json({ ok: false, message: "Trip request not found" }, { status: 404 });
  }
  if (message?.includes("not_cancellable")) {
    return NextResponse.json(
      { ok: false, message: "Only pending requests can be cancelled" },
      { status: 400 },
    );
  }
  if (message?.includes("not_rejectable")) {
    return NextResponse.json(
      { ok: false, message: "Only pending requests can be rejected" },
      { status: 400 },
    );
  }
  if (message?.includes("not_linkable")) {
    return NextResponse.json(
      { ok: false, message: "Only pending requests can be linked to an auction" },
      { status: 400 },
    );
  }
  if (message?.includes("not_deletable")) {
    return NextResponse.json(
      { ok: false, message: "Converted requests cannot be deleted (linked auction preserves audit trail)" },
      { status: 400 },
    );
  }
  if (message?.includes("reason_required")) {
    return NextResponse.json({ ok: false, message: "Reason is required" }, { status: 400 });
  }
  if (message?.includes("invalid_consigner")) {
    return NextResponse.json({ ok: false, message: "Invalid consigner" }, { status: 400 });
  }
  if (message?.includes("invalid_delivery_request")) {
    return NextResponse.json({ ok: false, message: "Invalid delivery request" }, { status: 400 });
  }
  if (message?.includes("pickup_address_required")) {
    return NextResponse.json({ ok: false, message: "Pickup address is required" }, { status: 400 });
  }
  if (message?.includes("delivery_address_required")) {
    return NextResponse.json({ ok: false, message: "Delivery address is required" }, { status: 400 });
  }
  if (message?.includes("cargo_description_required")) {
    return NextResponse.json({ ok: false, message: "Cargo description is required" }, { status: 400 });
  }
  return NextResponse.json({ ok: false, message }, { status: 500 });
}
