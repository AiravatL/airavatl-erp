import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { requireDeliveryRequestActor, mapRpcError } from "@/app/api/delivery-requests/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actorResult = await requireDeliveryRequestActor();
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || null;
  const status = searchParams.get("status")?.trim() || null;
  const source = searchParams.get("source")?.trim() || null;
  const limit = Number(searchParams.get("limit") ?? 50);
  const offset = Number(searchParams.get("offset") ?? 0);

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc(
    "auction_list_v1",
    {
      p_actor_user_id: actorResult.actor.id,
      p_search: search,
      p_status: status,
      p_source: source,
      p_limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50,
      p_offset: Number.isFinite(offset) ? Math.max(0, offset) : 0,
    } as never,
  );

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: auction_list_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to list auctions", rpcError.code);
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

interface LocationInput {
  placeId?: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  city: string;
  state?: string;
  primaryText?: string;
  secondaryText?: string;
  addressComponents?: unknown;
  contactName?: string;
  contactPhone?: string;
}

interface CreateBody {
  consignerProfileId?: string;
  pickup?: LocationInput;
  delivery?: LocationInput;
  route?: {
    distanceKm?: number;
    durationMinutes?: number;
    polyline?: string;
  };
  vehicleMasterTypeId?: string;
  cargoWeightKg?: number;
  cargoDescription?: string;
  cargoType?: string;
  specialInstructions?: string;
  consignmentDate?: string;
  auctionDurationMinutes?: number;
  internalNotes?: string;
}

export async function POST(request: Request) {
  const actorResult = await requireDeliveryRequestActor();
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as CreateBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, message: "Invalid request body" }, { status: 400 });
  }

  if (!body.pickup?.formattedAddress || !body.delivery?.formattedAddress) {
    return NextResponse.json(
      { ok: false, message: "Pickup and delivery locations are required" },
      { status: 400 },
    );
  }
  if (!body.vehicleMasterTypeId) {
    return NextResponse.json({ ok: false, message: "Vehicle type is required" }, { status: 400 });
  }
  if (!body.consignmentDate) {
    return NextResponse.json({ ok: false, message: "Consignment date is required" }, { status: 400 });
  }

  // Calculate route server-side if not provided
  let routeData = body.route ?? {};
  if (routeData.distanceKm == null && body.pickup.latitude && body.delivery.latitude) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (apiKey) {
      try {
        const params = new URLSearchParams({
          origin: `${body.pickup.latitude},${body.pickup.longitude}`,
          destination: `${body.delivery.latitude},${body.delivery.longitude}`,
          key: apiKey,
          mode: "driving",
          units: "metric",
        });
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`,
          { signal: AbortSignal.timeout(10000) },
        );
        if (res.ok) {
          const dirBody = await res.json();
          if (dirBody.status === "OK" && dirBody.routes?.length) {
            const leg = dirBody.routes[0].legs?.[0];
            routeData = {
              distanceKm: leg?.distance?.value ? Math.round((leg.distance.value / 1000) * 10) / 10 : undefined,
              durationMinutes: leg?.duration?.value ? Math.round(leg.duration.value / 60) : undefined,
              polyline: dirBody.routes[0].overview_polyline?.points ?? undefined,
            };
          }
        }
      } catch {
        // Directions API failed — proceed without route data
      }
    }
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("auction_create_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_consigner_profile_id: body.consignerProfileId ?? null,
    // Pickup
    p_pickup_formatted_address: body.pickup.formattedAddress,
    p_pickup_latitude: body.pickup.latitude,
    p_pickup_longitude: body.pickup.longitude,
    p_pickup_city: body.pickup.city,
    p_pickup_state: body.pickup.state ?? null,
    p_pickup_place_id: body.pickup.placeId ?? null,
    p_pickup_primary_text: body.pickup.primaryText ?? null,
    p_pickup_secondary_text: body.pickup.secondaryText ?? null,
    p_pickup_address_components: body.pickup.addressComponents ?? null,
    p_pickup_contact_name: body.pickup.contactName ?? null,
    p_pickup_contact_phone: body.pickup.contactPhone ?? null,
    // Delivery
    p_delivery_formatted_address: body.delivery.formattedAddress,
    p_delivery_latitude: body.delivery.latitude,
    p_delivery_longitude: body.delivery.longitude,
    p_delivery_city: body.delivery.city,
    p_delivery_state: body.delivery.state ?? null,
    p_delivery_place_id: body.delivery.placeId ?? null,
    p_delivery_primary_text: body.delivery.primaryText ?? null,
    p_delivery_secondary_text: body.delivery.secondaryText ?? null,
    p_delivery_address_components: body.delivery.addressComponents ?? null,
    p_delivery_contact_name: body.delivery.contactName ?? null,
    p_delivery_contact_phone: body.delivery.contactPhone ?? null,
    // Route
    p_estimated_distance_km: routeData.distanceKm ?? null,
    p_estimated_duration_minutes: routeData.durationMinutes ?? null,
    p_route_polyline: routeData.polyline ?? null,
    // Cargo
    p_vehicle_master_type_id: body.vehicleMasterTypeId ?? null,
    p_cargo_weight_kg: body.cargoWeightKg ?? null,
    p_cargo_description: body.cargoDescription ?? null,
    p_cargo_type: body.cargoType ?? "general",
    p_special_instructions: body.specialInstructions ?? null,
    // Schedule
    p_consignment_date: body.consignmentDate,
    // Auction
    p_auction_duration_minutes: body.auctionDurationMinutes ?? 60,
    // Internal
    p_internal_notes: body.internalNotes ?? null,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: auction_create_v1" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to create delivery request", rpcError.code);
  }

  const result = rpcData as { request_id: string; request_number: string; auction_end_time: string } | null;
  if (!result) {
    return NextResponse.json(
      { ok: false, message: "Unable to create delivery request" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        requestId: result.request_id,
        requestNumber: result.request_number,
        auctionEndTime: result.auction_end_time,
      },
    },
    { status: 201 },
  );
}
