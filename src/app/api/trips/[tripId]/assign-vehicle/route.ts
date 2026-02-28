import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireTripActor } from "@/app/api/trips/_shared";

interface AssignBody {
  vehicleId?: string;
  driverId?: string | null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { tripId } = await params;
  const body = (await request.json().catch(() => null)) as AssignBody | null;

  if (!body?.vehicleId) {
    return NextResponse.json({ ok: false, message: "Vehicle is required" }, { status: 400 });
  }

  let rpcData: unknown = null;
  let rpcError: { message?: string; code?: string } | null = null;

  const v3Result = await actorResult.supabase.rpc("trip_assign_vehicle_v3", {
    p_actor_user_id: actorResult.actor.id,
    p_trip_id: tripId,
    p_vehicle_id: body.vehicleId,
    p_driver_id: body.driverId ?? null,
  } as never);

  if (v3Result.error && isMissingRpcError(v3Result.error)) {
    const v2Result = await actorResult.supabase.rpc("trip_assign_vehicle_v2", {
      p_actor_user_id: actorResult.actor.id,
      p_trip_id: tripId,
      p_vehicle_id: body.vehicleId,
      p_driver_id: body.driverId ?? null,
    } as never);

    if (v2Result.error && isMissingRpcError(v2Result.error)) {
      const v2LegacyResult = await actorResult.supabase.rpc("trip_assign_vehicle_v2", {
        p_actor_user_id: actorResult.actor.id,
        p_trip_id: tripId,
        p_vehicle_id: body.vehicleId,
      } as never);

      if (v2LegacyResult.error && isMissingRpcError(v2LegacyResult.error)) {
        const v1Result = await actorResult.supabase.rpc("trip_assign_vehicle_v1", {
          p_actor_user_id: actorResult.actor.id,
          p_trip_id: tripId,
          p_vehicle_id: body.vehicleId,
        } as never);
        rpcData = v1Result.data;
        rpcError = v1Result.error ? { message: v1Result.error.message, code: v1Result.error.code } : null;
      } else {
        rpcData = v2LegacyResult.data;
        rpcError = v2LegacyResult.error
          ? { message: v2LegacyResult.error.message, code: v2LegacyResult.error.code }
          : null;
      }
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
        { ok: false, message: "Missing RPC: trip_assign_vehicle_v1/trip_assign_vehicle_v2/trip_assign_vehicle_v3" },
        { status: 500 },
      );
    }
    return mapRpcError(rpcError.message ?? "Unable to assign vehicle", rpcError.code);
  }

  const result = rpcData as {
    trip_id: string;
    trip_code: string;
    vehicle_number: string;
    ops_vehicles_owner_id: string;
  } | null;

  if (!result) {
    return NextResponse.json({ ok: false, message: "Unable to assign vehicle" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      tripId: result.trip_id,
      tripCode: result.trip_code,
      vehicleNumber: result.vehicle_number,
      opsVehiclesOwnerId: result.ops_vehicles_owner_id,
    },
  });
}
