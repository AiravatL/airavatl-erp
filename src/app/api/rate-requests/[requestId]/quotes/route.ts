import { NextResponse } from "next/server";
import {
  mapRateRequestRpcError,
  normalizeRateRequestQuoteRow,
  RATE_REQUEST_PRICING_ROLES,
  RATE_REQUEST_VIEW_ROLES,
  requireRateRequestActor,
  type RateRequestQuoteRow,
} from "@/app/api/rate-requests/_shared";

const SOURCE_MAX_LENGTH = 100;
const REMARKS_MAX_LENGTH = 500;
const CONFIDENCE_LEVELS = new Set(["low", "medium", "high"]);
const MAX_AMOUNT = 1_000_000_000_000;

interface RouteParams {
  params: Promise<{ requestId: string }>;
}

interface CreateQuoteBody {
  freightRate?: unknown;
  ratePerTon?: unknown;
  ratePerKg?: unknown;
  confidenceLevel?: unknown;
  source?: unknown;
  remarks?: unknown;
}

function toTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(_: Request, context: RouteParams) {
  const actorResult = await requireRateRequestActor(RATE_REQUEST_VIEW_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { requestId } = await context.params;
  if (!requestId) {
    return NextResponse.json({ ok: false, message: "Missing requestId" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("rate_request_quote_list_v1", {
    p_request_id: requestId,
    p_limit: 100,
    p_offset: 0,
    p_actor_user_id: actorResult.actor.id,
  } as never);

  if (rpcError) {
    return mapRateRequestRpcError(rpcError.message ?? "Unable to fetch rate quotes", rpcError.code);
  }

  const rows = (Array.isArray(rpcData) ? rpcData : rpcData ? [rpcData] : []) as RateRequestQuoteRow[];
  return NextResponse.json({ ok: true, data: rows.map((row) => normalizeRateRequestQuoteRow(row)) });
}

export async function POST(request: Request, context: RouteParams) {
  const actorResult = await requireRateRequestActor(RATE_REQUEST_PRICING_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { requestId } = await context.params;
  if (!requestId) {
    return NextResponse.json({ ok: false, message: "Missing requestId" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as CreateQuoteBody | null;

  const freightRate = toNumber(body?.freightRate);
  const ratePerTon = toNumber(body?.ratePerTon);
  const ratePerKg = toNumber(body?.ratePerKg);
  const confidenceLevel = toTrimmed(body?.confidenceLevel).toLowerCase();
  const source = toTrimmed(body?.source);
  const remarks = toTrimmed(body?.remarks);

  if (freightRate === null || freightRate <= 0 || freightRate > MAX_AMOUNT) {
    return NextResponse.json({ ok: false, message: "freightRate must be a positive number" }, { status: 400 });
  }

  if (ratePerTon !== null && (ratePerTon < 0 || ratePerTon > MAX_AMOUNT)) {
    return NextResponse.json({ ok: false, message: "ratePerTon must be non-negative" }, { status: 400 });
  }

  if (ratePerKg !== null && (ratePerKg < 0 || ratePerKg > MAX_AMOUNT)) {
    return NextResponse.json({ ok: false, message: "ratePerKg must be non-negative" }, { status: 400 });
  }

  if (confidenceLevel && !CONFIDENCE_LEVELS.has(confidenceLevel)) {
    return NextResponse.json({ ok: false, message: "Invalid confidenceLevel" }, { status: 400 });
  }

  if (source.length > SOURCE_MAX_LENGTH) {
    return NextResponse.json({ ok: false, message: "source is too long" }, { status: 400 });
  }

  if (remarks.length > REMARKS_MAX_LENGTH) {
    return NextResponse.json({ ok: false, message: "remarks is too long" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("rate_request_quote_submit_v1", {
    p_request_id: requestId,
    p_freight_rate: freightRate,
    p_rate_per_ton: ratePerTon,
    p_rate_per_kg: ratePerKg,
    p_confidence_level: confidenceLevel || null,
    p_source: source || null,
    p_remarks: remarks || null,
    p_actor_user_id: actorResult.actor.id,
  } as never);

  if (rpcError) {
    return mapRateRequestRpcError(rpcError.message ?? "Unable to submit quote", rpcError.code);
  }

  const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as RateRequestQuoteRow | undefined;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Unable to submit quote" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: normalizeRateRequestQuoteRow(row) }, { status: 201 });
}
