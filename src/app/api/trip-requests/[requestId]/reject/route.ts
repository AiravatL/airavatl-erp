import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  requireTripRequestActor,
  TRIP_REQUEST_OPS_ROLES,
  mapTripRequestRpcError,
} from "@/app/api/trip-requests/_shared";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const actorResult = await requireTripRequestActor(TRIP_REQUEST_OPS_ROLES);
  if ("error" in actorResult) return actorResult.error;

  const { requestId } = await params;
  if (!requestId) {
    return NextResponse.json({ ok: false, message: "requestId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { reason?: string } | null;
  const reason = body?.reason?.trim();
  if (!reason) {
    return NextResponse.json({ ok: false, message: "Reason is required" }, { status: 400 });
  }

  const { error: rpcError } = await actorResult.supabase.rpc("trip_request_reject_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_id: requestId,
    p_reason: reason,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: trip_request_reject_v1" },
        { status: 500 },
      );
    }
    return mapTripRequestRpcError(rpcError.message ?? "Unable to reject trip request", rpcError.code);
  }

  return NextResponse.json({ ok: true, data: { id: requestId, status: "rejected" } });
}
