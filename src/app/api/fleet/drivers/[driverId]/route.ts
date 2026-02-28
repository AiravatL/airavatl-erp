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

interface UpdateBody {
  fullName?: unknown;
  phone?: unknown;
  alternatePhone?: unknown;
  isOwnerDriver?: unknown;
}

function toOptionalTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

  const body = (await request.json().catch(() => null)) as UpdateBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, message: "Invalid request body" }, { status: 400 });
  }

  const fullName = toOptionalTrimmed(body.fullName);
  const phone = toOptionalTrimmed(body.phone);
  const alternatePhone = toOptionalTrimmed(body.alternatePhone);
  const isOwnerDriver = typeof body.isOwnerDriver === "boolean" ? body.isOwnerDriver : null;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("vendor_driver_update_v1", {
    p_actor: actorResult.actor.id,
    p_driver_id: driverId,
    p_full_name: fullName,
    p_phone: phone,
    p_alternate_phone: alternatePhone,
    p_is_owner_driver: isOwnerDriver,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: vendor_driver_update_v1" }, { status: 500 });
    }
    return mapFleetRpcError(rpcError.message ?? "Unable to update driver", rpcError.code);
  }

  const row = rpcData as DriverRow | null;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to update driver" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeRow(row) });
}
