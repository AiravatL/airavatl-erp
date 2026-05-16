import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  requireTripRequestActor,
  mapTripRequestRpcError,
} from "@/app/api/trip-requests/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actorResult = await requireTripRequestActor();
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim() || null;
  const search = searchParams.get("search")?.trim() || null;
  const source = searchParams.get("source")?.trim() || null;
  const consignerId = searchParams.get("consignerId")?.trim() || null;
  const limit = Number(searchParams.get("limit") ?? 50);
  const offset = Number(searchParams.get("offset") ?? 0);

  // sales_consigner sees only their own; everyone else sees all.
  const onlyMineFor =
    actorResult.actor.role === "sales_consigner" ? actorResult.actor.id : null;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "trip_request_list_v1",
    {
      p_status: status,
      p_search: search,
      p_consigner_id: consignerId,
      p_only_mine_for: onlyMineFor,
      p_source: source,
      p_limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50,
      p_offset: Number.isFinite(offset) ? Math.max(0, offset) : 0,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: trip_request_list_v1" },
        { status: 500 },
      );
    }
    return mapTripRequestRpcError(rpcError.message ?? "Unable to list trip requests", rpcError.code);
  }

  const result = rpcData as {
    total: number;
    limit: number;
    offset: number;
    items: Array<Record<string, unknown>>;
  } | null;

  return NextResponse.json({
    ok: true,
    data: {
      total: result?.total ?? 0,
      limit: result?.limit ?? 50,
      offset: result?.offset ?? 0,
      items: result?.items ?? [],
    },
  });
}

interface CreateBody {
  consignerId?: string;
  pickupAddress?: string;
  pickupCity?: string;
  pickupState?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  pickupPlaceId?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  deliveryPlaceId?: string;
  cargoDescription?: string;
  cargoWeightKg?: number;
  cargoType?: string;
  specialInstructions?: string;
  preferredPickupAt?: string;
  notes?: string;
}

export async function POST(request: Request) {
  const actorResult = await requireTripRequestActor();
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, message: "Invalid request body" }, { status: 400 });
  }
  if (!body.consignerId) {
    return NextResponse.json({ ok: false, message: "Consigner is required" }, { status: 400 });
  }
  if (!body.pickupAddress?.trim()) {
    return NextResponse.json({ ok: false, message: "Pickup address is required" }, { status: 400 });
  }
  if (!body.deliveryAddress?.trim()) {
    return NextResponse.json({ ok: false, message: "Delivery address is required" }, { status: 400 });
  }
  if (!body.cargoDescription?.trim()) {
    return NextResponse.json({ ok: false, message: "Cargo description is required" }, { status: 400 });
  }

  const payload: Record<string, string | null> = {
    pickup_address: body.pickupAddress.trim(),
    pickup_city: body.pickupCity?.trim() ?? null,
    pickup_state: body.pickupState?.trim() ?? null,
    pickup_latitude: body.pickupLatitude != null ? String(body.pickupLatitude) : null,
    pickup_longitude: body.pickupLongitude != null ? String(body.pickupLongitude) : null,
    pickup_place_id: body.pickupPlaceId?.trim() ?? null,
    delivery_address: body.deliveryAddress.trim(),
    delivery_city: body.deliveryCity?.trim() ?? null,
    delivery_state: body.deliveryState?.trim() ?? null,
    delivery_latitude: body.deliveryLatitude != null ? String(body.deliveryLatitude) : null,
    delivery_longitude: body.deliveryLongitude != null ? String(body.deliveryLongitude) : null,
    delivery_place_id: body.deliveryPlaceId?.trim() ?? null,
    cargo_description: body.cargoDescription.trim(),
    cargo_weight_kg: body.cargoWeightKg != null ? String(body.cargoWeightKg) : null,
    cargo_type: body.cargoType?.trim() ?? "general",
    special_instructions: body.specialInstructions?.trim() ?? null,
    preferred_pickup_at: body.preferredPickupAt?.trim() ?? null,
    notes: body.notes?.trim() ?? null,
  };

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "trip_request_sales_create_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_consigner_id: body.consignerId,
      p_input: payload,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: trip_request_sales_create_v1" },
        { status: 500 },
      );
    }
    return mapTripRequestRpcError(rpcError.message ?? "Unable to create trip request", rpcError.code);
  }

  const result = rpcData as { id: string; request_number: string; status: string } | null;
  if (!result) {
    return NextResponse.json({ ok: false, message: "Unable to create trip request" }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        id: result.id,
        requestNumber: result.request_number,
        status: result.status,
      },
    },
    { status: 201 },
  );
}
