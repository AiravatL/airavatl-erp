import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import { mapRpcError, normalizeTripRow, requireTripActor, type TripRow } from "@/app/api/trips/_shared";

function parseDateOrNull(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export async function GET(request: Request) {
  const actorResult = await requireTripActor();
  if ("error" in actorResult) return actorResult.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || null;
  const fromDate = parseDateOrNull(searchParams.get("fromDate"));
  const toDate = parseDateOrNull(searchParams.get("toDate"));
  const limit = Number(searchParams.get("limit") ?? 50);
  const offset = Number(searchParams.get("offset") ?? 0);

  if (searchParams.get("fromDate") && !fromDate) {
    return NextResponse.json({ ok: false, message: "Invalid fromDate" }, { status: 400 });
  }
  if (searchParams.get("toDate") && !toDate) {
    return NextResponse.json({ ok: false, message: "Invalid toDate" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("trip_list_history_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_search: search,
    p_limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 50,
    p_offset: Number.isFinite(offset) ? Math.max(0, offset) : 0,
    p_from_date: fromDate,
    p_to_date: toDate,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json({ ok: false, message: "Missing RPC: trip_list_history_v1" }, { status: 500 });
    }
    return mapRpcError(rpcError.message ?? "Unable to fetch trip history", rpcError.code);
  }

  const rows = (Array.isArray(rpcData) ? rpcData : []) as TripRow[];
  return NextResponse.json({ ok: true, data: rows.map(normalizeTripRow) });
}
