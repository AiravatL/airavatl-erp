import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  mapRpcError,
  normalizeTripRow,
  requireTripActor,
  type TripRow,
} from "@/app/api/trips/_shared";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { tripId } = await params;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("trip_get_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_trip_id: tripId,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_get_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch trip", rpcError.code);
  }

  const row = rpcData as TripRow | null;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Trip not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: normalizeTripRow(row) });
}

interface UpdateBody {
  pickupLocation?: string;
  dropLocation?: string;
  vehicleType?: string;
  vehicleLength?: string;
  weightEstimate?: number;
  plannedKm?: number;
  scheduleDate?: string;
  tripAmount?: number;
  internalNotes?: string;
}

const LOCATION_MAX_LENGTH = 120;
const VEHICLE_TYPE_MAX_LENGTH = 120;
const VEHICLE_LENGTH_MAX_LENGTH = 40;
const INTERNAL_NOTES_MAX_LENGTH = 500;
const MAX_WEIGHT = 99999;
const MAX_DISTANCE_KM = 999999;
const MAX_TRIP_AMOUNT = 1_000_000_000_000;

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { tripId } = await params;
  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  const pickupLocation = typeof body?.pickupLocation === "string" ? body.pickupLocation.trim() : "";
  const dropLocation = typeof body?.dropLocation === "string" ? body.dropLocation.trim() : "";
  const vehicleType = typeof body?.vehicleType === "string" ? body.vehicleType.trim() : "";
  const vehicleLength = typeof body?.vehicleLength === "string" ? body.vehicleLength.trim() : "";
  const internalNotes = typeof body?.internalNotes === "string" ? body.internalNotes.trim() : "";
  const weightEstimate = toNullableNumber(body?.weightEstimate);
  const plannedKm = toNullableNumber(body?.plannedKm);
  const tripAmount = toNullableNumber(body?.tripAmount);

  if (pickupLocation.length > LOCATION_MAX_LENGTH || dropLocation.length > LOCATION_MAX_LENGTH) {
    return NextResponse.json({ ok: false, message: "Location is too long" }, { status: 400 });
  }
  if (vehicleType.length > VEHICLE_TYPE_MAX_LENGTH) {
    return NextResponse.json({ ok: false, message: "vehicleType is too long" }, { status: 400 });
  }
  if (vehicleLength.length > VEHICLE_LENGTH_MAX_LENGTH) {
    return NextResponse.json({ ok: false, message: "vehicleLength is too long" }, { status: 400 });
  }
  if (internalNotes.length > INTERNAL_NOTES_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `internalNotes must be at most ${INTERNAL_NOTES_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (weightEstimate !== null && (weightEstimate < 0 || weightEstimate > MAX_WEIGHT)) {
    return NextResponse.json({ ok: false, message: "weightEstimate is out of range" }, { status: 400 });
  }
  if (plannedKm !== null && (plannedKm < 0 || plannedKm > MAX_DISTANCE_KM)) {
    return NextResponse.json({ ok: false, message: "plannedKm is out of range" }, { status: 400 });
  }
  if (tripAmount !== null && (tripAmount < 0 || tripAmount > MAX_TRIP_AMOUNT)) {
    return NextResponse.json({ ok: false, message: "tripAmount is out of range" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("trip_request_update_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_trip_id: tripId,
    p_pickup_location: pickupLocation || null,
    p_drop_location: dropLocation || null,
    p_vehicle_type: vehicleType || null,
    p_vehicle_length: vehicleLength || null,
    p_weight_estimate: weightEstimate,
    p_planned_km: plannedKm,
    p_schedule_date: body?.scheduleDate || null,
    p_trip_amount: tripAmount,
    p_internal_notes: internalNotes || null,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_request_update_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to update trip request", rpcError.code);
  }

  const result = rpcData as { trip_id: string; trip_code: string } | null;
  if (!result) {
    return NextResponse.json({ ok: false, message: "Unable to update trip request" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: { tripId: result.trip_id, tripCode: result.trip_code } });
}
