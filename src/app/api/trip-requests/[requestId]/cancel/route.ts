import { NextResponse } from "next/server";
import { isMissingRpcError } from "@/lib/supabase/rpc";
import {
  requireTripRequestActor,
  mapTripRequestRpcError,
} from "@/app/api/trip-requests/_shared";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const actorResult = await requireTripRequestActor();
  if ("error" in actorResult) return actorResult.error;

  const { requestId } = await params;
  if (!requestId) {
    return NextResponse.json({ ok: false, message: "requestId is required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { reason?: string } | null;
  const reason = body?.reason?.trim() || null;

  // sales_consigner can only cancel their own request; fetch detail to verify.
  if (actorResult.actor.role === "sales_consigner") {
    const { data: row, error: detailErr } = await actorResult.supabase.rpc(
      "trip_request_detail_v1",
      { p_id: requestId } as never,
    );
    if (detailErr) {
      return mapTripRequestRpcError(detailErr.message ?? "Unable to verify ownership", detailErr.code);
    }
    const rowObj = row as Record<string, unknown> | null;
    if (!rowObj) {
      return NextResponse.json({ ok: false, message: "Trip request not found" }, { status: 404 });
    }
    if (rowObj.created_by !== actorResult.actor.id) {
      return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
    }
  }

  const { error: rpcError } = await actorResult.supabase.rpc("trip_request_cancel_v1", {
    p_actor_user_id: actorResult.actor.id,
    p_id: requestId,
    p_reason: reason,
  } as never);

  if (rpcError) {
    if (isMissingRpcError(rpcError)) {
      return NextResponse.json(
        { ok: false, message: "Missing RPC: trip_request_cancel_v1" },
        { status: 500 },
      );
    }
    return mapTripRequestRpcError(rpcError.message ?? "Unable to cancel trip request", rpcError.code);
  }

  return NextResponse.json({ ok: true, data: { id: requestId, status: "cancelled" } });
}
