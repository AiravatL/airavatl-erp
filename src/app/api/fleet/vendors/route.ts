import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapFleetRpcError, requireFleetActor } from "@/app/api/fleet/_shared";

export const dynamic = "force-dynamic";

interface FleetVendorRow {
  id: string;
  name: string;
  contact_phone: string | null;
  kyc_status: "verified" | "pending" | "rejected";
  active: boolean;
  notes: string | null;
  vehicles_count: number | string | null;
  drivers_count?: number | string | null;
  owner_driver_flag: boolean;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: Request) {
  const actorResult = await requireFleetActor();
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || null;
  const vehicleType = searchParams.get("vehicleType")?.trim() || null;
  const vendorKindRaw = searchParams.get("vendorKind")?.trim() || null;
  const vendorKind =
    vendorKindRaw === "vendor" || vendorKindRaw === "owner_driver" ? vendorKindRaw : null;
  const limit = Number(searchParams.get("limit") ?? 200);
  const offset = Number(searchParams.get("offset") ?? 0);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 200;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  const rpcParams = {
    p_actor: actorResult.actor.id,
    p_search: search,
    p_vehicle_type: vehicleType,
    p_vendor_kind: vendorKind,
    p_limit: safeLimit,
    p_offset: safeOffset,
  } as never;

  const v3Result = await actorResult.supabase.rpc("vendor_list_v3", rpcParams);
  let rpcData = v3Result.data;
  let rpcError = v3Result.error;

  if (rpcError && isMissingRpcError(rpcError)) {
    const v2Result = await actorResult.supabase.rpc("vendor_list_v2", rpcParams);
    rpcData = v2Result.data;
    rpcError = v2Result.error;
  }

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: vendor_list_v2/vendor_list_v3" }, { status: 500 });
    }
    return mapFleetRpcError(rpcError.message ?? "Unable to fetch fleet vendors", rpcError.code);
  }

  const rows = (Array.isArray(rpcData) ? rpcData : []) as FleetVendorRow[];

  return NextResponse.json({
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      name: row.name,
      contactPhone: row.contact_phone,
      kycStatus: row.kyc_status,
      active: row.active,
      notes: row.notes,
      vehiclesCount: toNumber(row.vehicles_count),
      driversCount: toNumber(row.drivers_count),
      isOwnerDriver: row.owner_driver_flag,
    })),
  });
}
