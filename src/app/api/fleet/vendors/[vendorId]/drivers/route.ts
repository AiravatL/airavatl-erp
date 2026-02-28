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

interface CreateBody {
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

const NAME_MAX = 120;
const PHONE_MIN = 10;
const PHONE_MAX = 15;

function isPhoneValid(value: string | null): boolean {
  if (!value) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= PHONE_MIN && digits.length <= PHONE_MAX;
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

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("vendor_driver_list_v1", {
    p_actor: actorResult.actor.id,
    p_vendor_id: vendorId,
    p_search: search,
    p_limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 200,
    p_offset: Number.isFinite(offset) ? Math.max(0, offset) : 0,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: vendor_driver_list_v1" }, { status: 500 });
    }
    return mapFleetRpcError(rpcError.message ?? "Unable to fetch drivers", rpcError.code);
  }

  const rows = (Array.isArray(rpcData) ? rpcData : []) as DriverRow[];
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
  const fullName = toOptionalTrimmed(body?.fullName);
  const phone = toOptionalTrimmed(body?.phone);
  const alternatePhone = toOptionalTrimmed(body?.alternatePhone);
  const isOwnerDriver = body?.isOwnerDriver === true;

  if (!fullName) {
    return NextResponse.json({ ok: false, message: "fullName is required" }, { status: 400 });
  }
  if (fullName.length > NAME_MAX) {
    return NextResponse.json({ ok: false, message: `fullName must be at most ${NAME_MAX} characters` }, { status: 400 });
  }
  if (!isPhoneValid(phone)) {
    return NextResponse.json({ ok: false, message: `phone must have ${PHONE_MIN}-${PHONE_MAX} digits` }, { status: 400 });
  }
  if (alternatePhone && !isPhoneValid(alternatePhone)) {
    return NextResponse.json({ ok: false, message: `alternatePhone must have ${PHONE_MIN}-${PHONE_MAX} digits` }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("vendor_driver_create_v1", {
    p_actor: actorResult.actor.id,
    p_vendor_id: vendorId,
    p_full_name: fullName,
    p_phone: phone,
    p_alternate_phone: alternatePhone,
    p_is_owner_driver: isOwnerDriver,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: vendor_driver_create_v1" }, { status: 500 });
    }
    return mapFleetRpcError(rpcError.message ?? "Unable to create driver", rpcError.code);
  }

  const row = rpcData as DriverRow | null;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to create driver" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeRow(row) }, { status: 201 });
}
