import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapFleetRpcError, requireFleetActor } from "@/app/api/fleet/_shared";

interface DriverRow {
  id: string;
  vendor_id: string;
  full_name: string;
  phone: string;
  alternate_phone: string | null;
  is_owner_driver: boolean;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface ActiveBody {
  active?: unknown;
}

function normalizeRow(row: DriverRow) {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    fullName: row.full_name,
    phone: row.phone,
    alternatePhone: row.alternate_phone,
    isOwnerDriver: row.is_owner_driver,
    active: row.active,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ driverId: string }> },
) {
  const actorResult = await requireFleetActor();
  if ("error" in actorResult) return actorResult.error;

  const { driverId } = await params;
  if (!driverId) {
    return NextResponse.json({ ok: false, message: "driverId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as ActiveBody | null;
  if (typeof body?.active !== "boolean") {
    return NextResponse.json({ ok: false, message: "active is required" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("vendor_driver_set_active_v1", {
    p_actor: actorResult.actor.id,
    p_driver_id: driverId,
    p_active: body.active,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: vendor_driver_set_active_v1" }, { status: 500 });
    }
    return mapFleetRpcError(rpcError.message ?? "Unable to update driver status", rpcError.code);
  }

  const row = rpcData as DriverRow | null;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to update driver status" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeRow(row) });
}
