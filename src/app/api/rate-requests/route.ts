import { NextResponse } from "next/server";
import {
  mapRateRequestRpcError,
  normalizeRateRequestRow,
  RATE_REQUEST_CREATOR_ROLES,
  RATE_REQUEST_VIEW_ROLES,
  requireRateRequestActor,
  type RateRequestRow,
} from "@/app/api/rate-requests/_shared";

const LOCATION_MAX_LENGTH = 120;
const VEHICLE_TYPE_MAX_LENGTH = 120;
const NOTES_MAX_LENGTH = 500;

const RATE_CATEGORIES = ["ftl", "ptl", "odc", "container", "express"] as const;

type RateCategory = (typeof RATE_CATEGORIES)[number];

interface CreateRateRequestBody {
  fromLocation?: unknown;
  toLocation?: unknown;
  vehicleType?: unknown;
  rateCategory?: unknown;
  notes?: unknown;
}

function isRateCategory(value: string): value is RateCategory {
  return RATE_CATEGORIES.includes(value as RateCategory);
}

function toTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const actorResult = await requireRateRequestActor(RATE_REQUEST_VIEW_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const status = toTrimmed(searchParams.get("status") ?? "").toLowerCase();
  const search = toTrimmed(searchParams.get("search") ?? "");
  const limit = Number(searchParams.get("limit") ?? 100);
  const offset = Number(searchParams.get("offset") ?? 0);

  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 300)) : 100;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  const statusParam = status === "open" || status === "fulfilled" || status === "cancelled" ? status : null;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("rate_request_list_v1", {
    p_status: statusParam,
    p_search: search || null,
    p_limit: safeLimit,
    p_offset: safeOffset,
    p_actor_user_id: actorResult.actor.id,
  } as never);

  if (rpcError) {
    return mapRateRequestRpcError(rpcError.message ?? "Unable to fetch rate requests", rpcError.code);
  }

  const rows = (Array.isArray(rpcData) ? rpcData : rpcData ? [rpcData] : []) as RateRequestRow[];
  return NextResponse.json({ ok: true, data: rows.map((row) => normalizeRateRequestRow(row)) });
}

export async function POST(request: Request) {
  const actorResult = await requireRateRequestActor(RATE_REQUEST_CREATOR_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as CreateRateRequestBody | null;

  const fromLocation = toTrimmed(body?.fromLocation);
  const toLocation = toTrimmed(body?.toLocation);
  const vehicleType = toTrimmed(body?.vehicleType);
  const rateCategory = toTrimmed(body?.rateCategory).toLowerCase();
  const notes = toTrimmed(body?.notes);

  if (!fromLocation || !toLocation || !vehicleType || !rateCategory) {
    return NextResponse.json(
      { ok: false, message: "fromLocation, toLocation, vehicleType and rateCategory are required" },
      { status: 400 },
    );
  }

  if (!isRateCategory(rateCategory)) {
    return NextResponse.json({ ok: false, message: "Invalid rate category" }, { status: 400 });
  }

  if (fromLocation.length > LOCATION_MAX_LENGTH || toLocation.length > LOCATION_MAX_LENGTH) {
    return NextResponse.json({ ok: false, message: "Location is too long" }, { status: 400 });
  }

  if (vehicleType.length > VEHICLE_TYPE_MAX_LENGTH) {
    return NextResponse.json({ ok: false, message: "Vehicle type is too long" }, { status: 400 });
  }

  if (notes.length > NOTES_MAX_LENGTH) {
    return NextResponse.json({ ok: false, message: "Notes is too long" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("rate_request_create_v1", {
    p_from_location: fromLocation,
    p_to_location: toLocation,
    p_vehicle_type: vehicleType,
    p_rate_category: rateCategory,
    p_notes: notes || null,
    p_actor_user_id: actorResult.actor.id,
  } as never);

  if (rpcError) {
    return mapRateRequestRpcError(rpcError.message ?? "Unable to create rate request", rpcError.code);
  }

  const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as RateRequestRow | undefined;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to create rate request" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeRateRequestRow(row) }, { status: 201 });
}
