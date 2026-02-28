import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireTripActor } from "@/app/api/trips/_shared";

export async function GET(request: Request) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const vehicleType = searchParams.get("vehicleType")?.trim() || null;
  const search = searchParams.get("search")?.trim() || null;
  const limit = Number(searchParams.get("limit") ?? 50);
  const offset = Number(searchParams.get("offset") ?? 0);

  const params = {
    p_actor_user_id: actorResult.actor.id,
    p_vehicle_type: vehicleType,
    p_search: search,
    p_limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50,
    p_offset: Number.isFinite(offset) ? Math.max(0, offset) : 0,
  } as never;

  const v3Result = await actorResult.supabase.rpc("trip_available_vehicles_v3", params);
  let rpcData: unknown = null;
  let rpcError: { message?: string; code?: string } | null = null;

  if (v3Result.error && isMissingRpcError(v3Result.error)) {
    const v2Result = await actorResult.supabase.rpc("trip_available_vehicles_v2", params);
    if (v2Result.error && isMissingRpcError(v2Result.error)) {
      const v1Result = await actorResult.supabase.rpc("trip_available_vehicles_v1", params);
      rpcData = v1Result.data;
      rpcError = v1Result.error ? { message: v1Result.error.message, code: v1Result.error.code } : null;
    } else {
      rpcData = v2Result.data;
      rpcError = v2Result.error ? { message: v2Result.error.message, code: v2Result.error.code } : null;
    }
  } else {
    rpcData = v3Result.data;
    rpcError = v3Result.error ? { message: v3Result.error.message, code: v3Result.error.code } : null;
  }

  if (rpcError) {
    if (isMissingRpcError(rpcError as never)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: trip_available_vehicles_v1/trip_available_vehicles_v2/trip_available_vehicles_v3" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch available vehicles", rpcError.code);
  }

  interface VehicleRow {
    id: string;
    number: string;
    type: string;
    vehicle_length: string | null;
    ownership_type: string;
    vendor_id: string | null;
    vendor_name: string;
    is_owner_driver: boolean;
    current_driver_id?: string | null;
    current_driver_name?: string | null;
    leased_driver_name?: string | null;
    leased_driver_phone?: string | null;
  }

  const rows = (Array.isArray(rpcData) ? rpcData : []) as VehicleRow[];
  const normalized = rows.map((r) => ({
    id: r.id,
    number: r.number,
    type: r.type,
    vehicleLength: r.vehicle_length ?? "",
    ownershipType: r.ownership_type,
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    isOwnerDriver: r.is_owner_driver,
    currentDriverId: r.current_driver_id ?? null,
    currentDriverName: r.current_driver_name ?? "",
    leasedDriverName: r.leased_driver_name ?? null,
    leasedDriverPhone: r.leased_driver_phone ?? null,
  }));

  return NextResponse.json({ ok: true, data: normalized });
}
