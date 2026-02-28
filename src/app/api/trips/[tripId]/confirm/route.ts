import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, requireTripActor } from "@/app/api/trips/_shared";

interface ConfirmBody {
  pickupLocation?: string;
  dropLocation?: string;
  vehicleType?: string;
  vehicleLength?: string;
  weightEstimate?: number;
  plannedKm?: number;
  scheduleDate?: string;
  tripAmount?: number;
  internalNotes?: string;
  opsVehiclesOwnerId?: string;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { tripId } = await params;
  const body = (await request.json().catch(() => null)) as ConfirmBody | null;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("trip_confirm_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_trip_id: tripId,
    p_pickup_location: typeof body?.pickupLocation === "string" ? body.pickupLocation.trim() || null : null,
    p_drop_location: typeof body?.dropLocation === "string" ? body.dropLocation.trim() || null : null,
    p_vehicle_type: toTrimmedString(body?.vehicleType),
    p_vehicle_length: toTrimmedString(body?.vehicleLength),
    p_weight_estimate: toNullableNumber(body?.weightEstimate),
    p_planned_km: toNullableNumber(body?.plannedKm),
    p_schedule_date: body?.scheduleDate || null,
    p_trip_amount: toNullableNumber(body?.tripAmount),
    p_internal_notes: typeof body?.internalNotes === "string" ? body.internalNotes.trim() || null : null,
    p_ops_vehicles_owner_id: body?.opsVehiclesOwnerId || null,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_confirm_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to confirm trip", rpcError.code);
  }

  const result = rpcData as { trip_id: string; trip_code: string } | null;
  if (!result) {
    return NextResponse.json({ ok: false, message: "Unable to confirm trip" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    data: { tripId: result.trip_id, tripCode: result.trip_code },
  });
}
