import { NextResponse } from "next/server";
import {
  mapRateRequestRpcError,
  normalizeRateRequestRow,
  RATE_REQUEST_VIEW_ROLES,
  requireRateRequestActor,
  type RateRequestRow,
} from "@/app/api/rate-requests/_shared";

interface RouteParams {
  params: Promise<{ requestId: string }>;
}

export async function GET(_: Request, context: RouteParams) {
  const actorResult = await requireRateRequestActor(RATE_REQUEST_VIEW_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { requestId } = await context.params;
  if (!requestId) {
    return NextResponse.json({ ok: false, message: "Missing requestId" }, { status: 400 });
  }

  const { data: rpcData, error: rpcError } = await actorResult.supabase.rpc("rate_request_get_v1", {
    p_request_id: requestId,
    p_actor_user_id: actorResult.actor.id,
  } as never);

  if (rpcError) {
    return mapRateRequestRpcError(rpcError.message ?? "Unable to fetch rate request", rpcError.code);
  }

  const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as RateRequestRow | undefined;
  if (!row) {
    return NextResponse.json({ ok: false, message: "Rate request not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: normalizeRateRequestRow(row) });
}
