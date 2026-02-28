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

interface CreateBody {
  number?: unknown;
  type?: unknown;
  vehicleLength?: unknown;
}

function toOptionalTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const NUMBER_MAX = 20;
const TYPE_MAX = 120;
const LENGTH_MAX = 40;

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ vendorId: string }> },
) {
  const actorResult = await requireFleetActor();
  if ("error" in actorResult) return actorResult.error;

  const { vendorId } = await params;
  if (!vendorId) {
    return NextResponse.json({ ok: false, message: "vendorId is required" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || null;
  const limit = Number(searchParams.get("limit") ?? 200);
  const offset = Number(searchParams.get("offset") ?? 0);

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("vendor_vehicle_list_v1", {
    p_actor: actorResult.actor.id,
    p_vendor_id: vendorId,
    p_search: search,
    p_limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 200,
    p_offset: Number.isFinite(offset) ? Math.max(0, offset) : 0,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: vendor_vehicle_list_v1" }, { status: 500 });
    }
    return mapFleetRpcError(rpcError.message ?? "Unable to fetch vehicles", rpcError.code);
  }

  const rows = (Array.isArray(rpcData) ? rpcData : []) as VehicleRow[];
  return NextResponse.json({ ok: true, data: rows.map(normalizeRow) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ vendorId: string }> },
) {
  const actorResult = await requireFleetActor();
  if ("error" in actorResult) return actorResult.error;

  const { vendorId } = await params;
  if (!vendorId) {
    return NextResponse.json({ ok: false, message: "vendorId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as CreateBody | null;
  const number = toOptionalTrimmed(body?.number)?.toUpperCase() ?? "";
  const type = toOptionalTrimmed(body?.type) ?? "";
  const vehicleLength = toOptionalTrimmed(body?.vehicleLength);

  if (!number || !type) {
    return NextResponse.json({ ok: false, message: "number and type are required" }, { status: 400 });
  }
  if (number.length > NUMBER_MAX) {
    return NextResponse.json({ ok: false, message: `number must be at most ${NUMBER_MAX} characters` }, { status: 400 });
  }
  if (type.length > TYPE_MAX) {
    return NextResponse.json({ ok: false, message: `type must be at most ${TYPE_MAX} characters` }, { status: 400 });
  }
  if (vehicleLength && vehicleLength.length > LENGTH_MAX) {
    return NextResponse.json({ ok: false, message: `vehicleLength must be at most ${LENGTH_MAX} characters` }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("vendor_vehicle_create_v1", {
    p_actor: actorResult.actor.id,
    p_vendor_id: vendorId,
    p_number: number,
    p_type: type,
    p_vehicle_length: vehicleLength,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: vendor_vehicle_create_v1" }, { status: 500 });
    }
    return mapFleetRpcError(rpcError.message ?? "Unable to create vehicle", rpcError.code);
  }

  const row = rpcData as VehicleRow | null;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to create vehicle" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeRow(row) }, { status: 201 });
}
