import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapFleetRpcError, requireFleetActor } from "@/app/api/fleet/_shared";

interface VendorRow {
  id: string;
  name: string;
  contact_phone: string | null;
  kyc_status: "verified" | "pending" | "rejected";
  active: boolean;
  notes: string | null;
  vehicles_count: number | string | null;
  drivers_count: number | string | null;
  owner_driver_flag: boolean;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ vendorId: string }> },
) {
  const actorResult = await requireFleetActor();
  if ("error" in actorResult) return actorResult.error;

  const { vendorId } = await params;
  if (!vendorId) {
    return NextResponse.json({ ok: false, message: "vendorId is required" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("vendor_get_v1", {
    p_actor: actorResult.actor.id,
    p_vendor_id: vendorId,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: vendor_get_v1" }, { status: 500 });
    }
    return mapFleetRpcError(rpcError.message ?? "Unable to fetch vendor", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as VendorRow | null)
    : ((rpcData ?? null) as VendorRow | null);

  if (!row) {
    return NextResponse.json({ ok: false, message: "Vendor not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      id: row.id,
      name: row.name,
      contactPhone: row.contact_phone,
      kycStatus: row.kyc_status,
      active: row.active,
      notes: row.notes,
      vehiclesCount: toNumber(row.vehicles_count),
      driversCount: toNumber(row.drivers_count),
      isOwnerDriver: row.owner_driver_flag,
    },
  });
}
