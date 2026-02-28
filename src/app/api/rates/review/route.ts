import { NextResponse } from "next/server";
import type { RateStatus } from "@/lib/types";
import {
  RATE_REVIEW_VIEW_ROLES,
  type RateRow,
  normalizeRateRow,
  requireRateActor,
} from "@/app/api/rates/_shared";

export const dynamic = "force-dynamic";

const RATE_STATUSES: RateStatus[] = ["pending", "rejected"];

function isRateStatus(value: string): value is RateStatus {
  return RATE_STATUSES.includes(value as RateStatus);
}

function mapRpcError(message: string, code?: string) {
  if (code === "42501") return NextResponse.json({ ok: false, message }, { status: 403 });
  if (code === "22023" || code === "22P02") return NextResponse.json({ ok: false, message }, { status: 400 });
  return NextResponse.json({ ok: false, message }, { status: 500 });
}

export async function GET(request: Request) {
  const actorResult = await requireRateActor(RATE_REVIEW_VIEW_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim() ?? "";
  const search = searchParams.get("search")?.trim() ?? "";
  const limit = Number(searchParams.get("limit") ?? 50);
  const offset = Number(searchParams.get("offset") ?? 0);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 50;
  const safeOffset = Number.isFinite(offset) ? Math.max(0, offset) : 0;

  if (status && !isRateStatus(status)) {
    return NextResponse.json({ ok: false, message: "Invalid status" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("rate_list_review_v1", {
    p_status: status || null,
    p_search: search || null,
    p_limit: safeLimit,
    p_offset: safeOffset,
    p_actor_user_id: actorResult.actor.id,
  } as never);

  if (rpcError) {
    return mapRpcError(rpcError.message ?? "Unable to fetch review rates", rpcError.code);
  }

  const rows = Array.isArray(rpcData)
    ? (rpcData as RateRow[])
    : rpcData
      ? ([rpcData] as RateRow[])
      : [];
  const mappedRows = rows.map((row) => normalizeRateRow(row));

  return NextResponse.json({ ok: true, data: mappedRows });
}
