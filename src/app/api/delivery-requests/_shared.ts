import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const DELIVERY_REQUEST_ALLOWED_ROLES: Role[] = [
  "super_admin",
  "admin",
  "operations",
];

export async function requireDeliveryRequestActor() {
  const actorResult = await requireServerActor(DELIVERY_REQUEST_ALLOWED_ROLES);
  if ("error" in actorResult) return actorResult;
  return { supabase: actorResult.supabase, actor: actorResult.actor };
}

export function mapRpcError(message: string, code?: string) {
  if (message?.includes("forbidden"))
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  if (message?.includes("pickup_address_required"))
    return NextResponse.json({ ok: false, message: "Pickup address is required" }, { status: 400 });
  if (message?.includes("pickup_coordinates_required"))
    return NextResponse.json({ ok: false, message: "Pickup location coordinates are required" }, { status: 400 });
  if (message?.includes("pickup_city_required"))
    return NextResponse.json({ ok: false, message: "Pickup city is required" }, { status: 400 });
  if (message?.includes("delivery_address_required"))
    return NextResponse.json({ ok: false, message: "Delivery address is required" }, { status: 400 });
  if (message?.includes("delivery_coordinates_required"))
    return NextResponse.json({ ok: false, message: "Delivery location coordinates are required" }, { status: 400 });
  if (message?.includes("delivery_city_required"))
    return NextResponse.json({ ok: false, message: "Delivery city is required" }, { status: 400 });
  if (message?.includes("vehicle_type_required"))
    return NextResponse.json({ ok: false, message: "Vehicle type is required" }, { status: 400 });
  if (message?.includes("consignment_date_required"))
    return NextResponse.json({ ok: false, message: "Consignment date is required" }, { status: 400 });
  if (message?.includes("auction_duration_invalid"))
    return NextResponse.json({ ok: false, message: "Auction duration must be between 15 and 1440 minutes" }, { status: 400 });
  if (message?.includes("default_consigner_creation_failed"))
    return NextResponse.json({ ok: false, message: "Failed to create default consigner. Contact admin." }, { status: 500 });
  if (message?.includes("request_id_required"))
    return NextResponse.json({ ok: false, message: "Request ID is required" }, { status: 400 });
  if (message?.includes("auction_not_found"))
    return NextResponse.json({ ok: false, message: "Auction not found" }, { status: 404 });
  if (message?.includes("auction_not_active"))
    return NextResponse.json({ ok: false, message: "Only active auctions can be cancelled" }, { status: 400 });
  if (message?.includes("auction_not_ended"))
    return NextResponse.json({ ok: false, message: "Auction must be ended before selecting a winner" }, { status: 400 });
  if (message?.includes("bid_not_found"))
    return NextResponse.json({ ok: false, message: "Bid not found" }, { status: 404 });
  if (message?.includes("bid_not_active"))
    return NextResponse.json({ ok: false, message: "Bid is no longer active" }, { status: 400 });
  if (message?.includes("invalid_trip_amount"))
    return NextResponse.json({ ok: false, message: "Consigner trip amount must be greater than 0" }, { status: 400 });
  if (message?.includes("trip_amount_below_minimum")) {
    const parts = message.split(":");
    const minAmt = parts[1] || "0";
    const minPct = parts[2] || "5";
    return NextResponse.json({ ok: false, message: `Trip amount must be at least ₹${Number(minAmt).toLocaleString("en-IN")} (bid + ${minPct}% minimum commission)` }, { status: 400 });
  }
  if (message?.includes("trip_creation_failed"))
    return NextResponse.json({ ok: false, message: "Failed to create trip. Please try again." }, { status: 500 });
  if (code === "42501")
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  return NextResponse.json({ ok: false, message }, { status: 500 });
}
