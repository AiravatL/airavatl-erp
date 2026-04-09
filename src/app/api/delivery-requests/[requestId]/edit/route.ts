import { NextResponse } from "next/server";
import { requireServerActor } from "@/lib/auth/server-actor";
import { isMissingRpcError } from "@/lib/supabase/rpc";

interface RouteParams { params: Promise<{ requestId: string }> }

export async function PUT(request: Request, context: RouteParams) {
  const actorResult = await requireServerActor(["super_admin", "admin", "operations"]);
  if ("error" in actorResult) return actorResult.error;

  const { requestId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ ok: false, message: "Request body is required" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "auction_update_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_request_id: requestId,
      p_pickup_formatted_address: body.pickupFormattedAddress ?? null,
      p_pickup_latitude: body.pickupLatitude ?? null,
      p_pickup_longitude: body.pickupLongitude ?? null,
      p_pickup_city: body.pickupCity ?? null,
      p_pickup_state: body.pickupState ?? null,
      p_pickup_contact_name: body.pickupContactName ?? null,
      p_pickup_contact_phone: body.pickupContactPhone ?? null,
      p_delivery_formatted_address: body.deliveryFormattedAddress ?? null,
      p_delivery_latitude: body.deliveryLatitude ?? null,
      p_delivery_longitude: body.deliveryLongitude ?? null,
      p_delivery_city: body.deliveryCity ?? null,
      p_delivery_state: body.deliveryState ?? null,
      p_delivery_contact_name: body.deliveryContactName ?? null,
      p_delivery_contact_phone: body.deliveryContactPhone ?? null,
      p_vehicle_master_type_id: body.vehicleMasterTypeId ?? null,
      p_cargo_weight_kg: body.cargoWeightKg ?? null,
      p_cargo_description: body.cargoDescription ?? null,
      p_cargo_type: body.cargoType ?? null,
      p_special_instructions: body.specialInstructions ?? null,
      p_consignment_date: body.consignmentDate ?? null,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: auction_update_v1" }, { status: 500 });
    }
    const msg = rpcError.message ?? "Unable to update auction";
    const status = msg.includes("auction_has_bids") ? 409 : msg.includes("auction_not_active") ? 400 : 500;
    return NextResponse.json({ ok: false, message: msg }, { status });
  }

  return NextResponse.json({ ok: true, data: rpcData });
}
