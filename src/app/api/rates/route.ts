import { NextResponse } from "next/server";
import type { RateCategory } from "@/lib/types";
import {
  RATE_CREATOR_ROLES,
  type RateRow,
  normalizeRateRow,
  requireRateActor,
} from "@/app/api/rates/_shared";

export const dynamic = "force-dynamic";

const RATE_CATEGORIES: RateCategory[] = ["ftl", "ptl", "odc", "container", "express"];
const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
const LOCATION_MAX_LENGTH = 120;
const VEHICLE_TYPE_MAX_LENGTH = 120;
const SOURCE_MAX_LENGTH = 100;
const REMARKS_MAX_LENGTH = 500;

interface CreateRateBody {
  fromLocation?: unknown;
  toLocation?: unknown;
  vehicleType?: unknown;
  rateCategory?: unknown;
  freightRate?: unknown;
  ratePerTon?: unknown;
  ratePerKg?: unknown;
  confidenceLevel?: unknown;
  source?: unknown;
  remarks?: unknown;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRateCategory(value: string): value is RateCategory {
  return RATE_CATEGORIES.includes(value as RateCategory);
}

function mapRpcError(message: string, code?: string) {
  if (message?.includes("unknown_vehicle_type")) {
    return NextResponse.json(
      { ok: false, message: "Please select a valid vehicle type from Vehicle Master" },
      { status: 400 },
    );
  }
  if (code === "42501") return NextResponse.json({ ok: false, message }, { status: 403 });
  if (code === "22023" || code === "22P02") return NextResponse.json({ ok: false, message }, { status: 400 });
  return NextResponse.json({ ok: false, message }, { status: 500 });
}

export async function GET(request: Request) {
  const actorResult = await requireRateActor();
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const vehicleType = searchParams.get("vehicleType")?.trim() ?? "";
  const rateCategory = searchParams.get("rateCategory")?.trim() ?? "";
  const limit = Number(searchParams.get("limit") ?? 100);
  const offset = Number(searchParams.get("offset") ?? 0);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 100;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("rate_list_approved_v1", {
    p_search: search || null,
    p_vehicle_type: vehicleType || null,
    p_rate_category: isRateCategory(rateCategory) ? rateCategory : null,
    p_limit: safeLimit,
    p_offset: safeOffset,
  } as never);

  if (rpcError) {
    return mapRpcError(rpcError.message ?? "Unable to fetch rates", rpcError.code);
  }

  const rows = Array.isArray(rpcData)
    ? (rpcData as RateRow[])
    : rpcData
      ? ([rpcData] as RateRow[])
      : [];
  const mappedRows = rows.map((row) => normalizeRateRow(row));

  return NextResponse.json({ ok: true, data: mappedRows });
}

export async function POST(request: Request) {
  const actorResult = await requireRateActor(RATE_CREATOR_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const body = (await request.json().catch(() => null)) as CreateRateBody | null;

  const fromLocation = typeof body?.fromLocation === "string" ? body.fromLocation.trim() : "";
  const toLocation = typeof body?.toLocation === "string" ? body.toLocation.trim() : "";
  const vehicleType = typeof body?.vehicleType === "string" ? body.vehicleType.trim() : "";
  const rateCategory = typeof body?.rateCategory === "string" ? body.rateCategory.trim() : "";
  const freightRate = toNumber(body?.freightRate);
  const ratePerTon = toNullableNumber(body?.ratePerTon);
  const ratePerKg = toNullableNumber(body?.ratePerKg);
  const confidenceLevel =
    typeof body?.confidenceLevel === "string" ? body.confidenceLevel.trim().toLowerCase() : "";
  const source = typeof body?.source === "string" ? body.source.trim() : "";
  const remarks = typeof body?.remarks === "string" ? body.remarks.trim() : "";

  if (!fromLocation || !toLocation || !vehicleType || !rateCategory || freightRate === null) {
    return NextResponse.json(
      {
        ok: false,
        message: "fromLocation, toLocation, vehicleType, rateCategory and freightRate are required",
      },
      { status: 400 },
    );
  }
  if (fromLocation.length > LOCATION_MAX_LENGTH || toLocation.length > LOCATION_MAX_LENGTH) {
    return NextResponse.json({ ok: false, message: "Location is too long" }, { status: 400 });
  }
  if (vehicleType.length > VEHICLE_TYPE_MAX_LENGTH) {
    return NextResponse.json({ ok: false, message: "vehicleType is too long" }, { status: 400 });
  }
  if (source.length > SOURCE_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `source must be at most ${SOURCE_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (remarks.length > REMARKS_MAX_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `remarks must be at most ${REMARKS_MAX_LENGTH} characters` },
      { status: 400 },
    );
  }

  if (!isRateCategory(rateCategory)) {
    return NextResponse.json({ ok: false, message: "Invalid rate category" }, { status: 400 });
  }

  if (freightRate <= 0) {
    return NextResponse.json({ ok: false, message: "freightRate must be greater than zero" }, { status: 400 });
  }

  if (ratePerTon !== null && ratePerTon < 0) {
    return NextResponse.json({ ok: false, message: "ratePerTon must be non-negative" }, { status: 400 });
  }

  if (ratePerKg !== null && ratePerKg < 0) {
    return NextResponse.json({ ok: false, message: "ratePerKg must be non-negative" }, { status: 400 });
  }

  if (confidenceLevel && !CONFIDENCE_LEVELS.includes(confidenceLevel as (typeof CONFIDENCE_LEVELS)[number])) {
    return NextResponse.json({ ok: false, message: "Invalid confidence level" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("rate_submit_v1", {
    p_from_location: fromLocation,
    p_to_location: toLocation,
    p_vehicle_type: vehicleType,
    p_rate_category: rateCategory,
    p_freight_rate: freightRate,
    p_rate_per_ton: ratePerTon,
    p_rate_per_kg: ratePerKg,
    p_confidence_level: confidenceLevel || null,
    p_source: source || null,
    p_remarks: remarks || null,
    p_actor_user_id: actorResult.actor.id,
  } as never);

  if (rpcError) {
    return mapRpcError(rpcError.message ?? "Unable to submit rate", rpcError.code);
  }

  const row = Array.isArray(rpcData)
    ? ((rpcData[0] ?? null) as RateRow | null)
    : ((rpcData ?? null) as RateRow | null);
  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to submit rate" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeRateRow(row) }, { status: 201 });
}
