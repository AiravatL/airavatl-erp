import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapFleetRpcError, requireFleetActor } from "@/app/api/fleet/_shared";

interface VehicleRow {
  id: string;
  number: string;
  type: string;
  vehicle_length: string | null;
  ownership_type: "leased" | "vendor";
  status: "available" | "on_trip" | "maintenance";
  vendor_id: string;
  current_trip_id?: string | null;
  current_driver_id?: string | null;
  current_driver_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface UpdateBody {
  number?: unknown;
  type?: unknown;
  vehicleLength?: unknown;
}

function toOptionalTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRow(row: VehicleRow) {
  return {
    id: row.id,
    number: row.number,
    type: row.type,
    vehicleLength: row.vehicle_length,
    ownershipType: row.ownership_type ?? "vendor",
    status: row.status ?? "available",
    vendorId: row.vendor_id,
    currentTripId: row.current_trip_id ?? null,
    currentDriverId: row.current_driver_id ?? null,
    currentDriverName: row.current_driver_name ?? null,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const actorResult = await requireFleetActor();
  if ("error" in actorResult) return actorResult.error;

  const { vehicleId } = await params;
  if (!vehicleId) {
    return NextResponse.json({ ok: false, message: "vehicleId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, message: "Invalid request body" }, { status: 400 });
  }

  const number = toOptionalTrimmed(body.number)?.toUpperCase() ?? null;
  const type = toOptionalTrimmed(body.type);
  const vehicleLength = toOptionalTrimmed(body.vehicleLength);
  const clearVehicleLength = body.vehicleLength === null || body.vehicleLength === "";

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("vendor_vehicle_update_v1", {
    p_actor: actorResult.actor.id,
    p_vehicle_id: vehicleId,
    p_number: number,
    p_type: type,
    p_vehicle_length: vehicleLength,
    p_clear_vehicle_length: clearVehicleLength,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: vendor_vehicle_update_v1" }, { status: 500 });
    }
    return mapFleetRpcError(rpcError.message ?? "Unable to update vehicle", rpcError.code);
  }

  const row = rpcData as VehicleRow | null;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to update vehicle" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeRow(row) });
}
