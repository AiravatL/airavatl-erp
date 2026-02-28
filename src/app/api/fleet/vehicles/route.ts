import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapFleetRpcError, requireFleetActor } from "@/app/api/fleet/_shared";

export const dynamic = "force-dynamic";

interface FleetVehicleRow {
  id: string;
  number: string;
  type: string;
  ownership_type: "leased" | "vendor";
  status: "available" | "on_trip" | "maintenance";
  vendor_id: string | null;
  vendor_name: string | null;
  owner_driver_flag: boolean;
  has_policy: boolean;
  current_trip_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET(request: Request) {
  const actorResult = await requireFleetActor();
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || null;
  const status = searchParams.get("status")?.trim() || null;
  const vehicleType = searchParams.get("vehicleType")?.trim() || null;
  const ownershipKindRaw = searchParams.get("ownershipKind")?.trim() || null;
  const ownershipKind =
    ownershipKindRaw === "leased" || ownershipKindRaw === "vendor" || ownershipKindRaw === "owner_driver"
      ? ownershipKindRaw
      : null;
  const limit = Number(searchParams.get("limit") ?? 200);
  const offset = Number(searchParams.get("offset") ?? 0);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 200;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("fleet_vehicle_list_v1", {
    p_actor: actorResult.actor.id,
    p_search: search,
    p_status: status,
    p_owner_kind: ownershipKind,
    p_vehicle_type: vehicleType,
    p_limit: safeLimit,
    p_offset: safeOffset,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: fleet_vehicle_list_v1" },
        { status: 500 },
      );
    }
    return mapFleetRpcError(rpcError.message ?? "Unable to fetch fleet vehicles", rpcError.code);
  }

  const rows = (Array.isArray(rpcData) ? rpcData : []) as FleetVehicleRow[];

  return NextResponse.json({
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      number: row.number,
      type: row.type,
      ownershipType: row.ownership_type,
      status: row.status,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      isOwnerDriver: row.owner_driver_flag,
      hasPolicy: row.has_policy,
      currentTripId: row.current_trip_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
}
